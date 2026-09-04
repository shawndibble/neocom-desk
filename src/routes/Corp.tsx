/**
 * `/corp` — the corp ops board.
 *
 * A corp manager does not browse, they triage, and everything that matters to
 * them is a clock. This route reads four endpoints, hands them to
 * `engine/corp/board.ts`, and renders the one ordered list that comes back.
 *
 * Three rules shape it:
 *
 * - **Each panel is gated on its own capability.** A Station Manager who is not
 *   an Accountant sees structures and no wallet rail, with no error and no
 *   empty-state noise (AC3). The gate is `useCorpRouteGate()`'s resolved
 *   `capabilities`, never a role string, and it decides what is *fetched* as
 *   well as what is drawn — an ungated read buys a guaranteed 403.
 * - **`unknown` renders neutrally here, and nothing in the nav.** The
 *   asymmetry is deliberate: a nav item that flickers into existence is worse
 *   than one a beat late (CONTEXT.md round 35), but bouncing a Director who
 *   deep-linked before their roles read landed is simply a bug.
 * - **Hour-stale data is stated, not hidden.** CCP caches these endpoints for
 *   about an hour, which every multi-day clock survives and no short one does.
 *   The `DataAgeBadge` note says so, and the board refuses to print a countdown
 *   shorter than the window.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, IconButton, PageHeader, Panel, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import { CorpBoard } from '@/features/corp/CorpBoard';
import { CorpVitalsRail } from '@/features/corp/CorpVitalsRail';
import { CorpPeopleRail } from '@/features/corp/CorpPeopleRail';
import {
  MASTER_WALLET_DIVISION,
  loadCorporationId,
  loadCorporationMiningExtractions,
  loadCorporationStructures,
} from '@/features/corp/boardData';
// The wallet, divisions, journal and industry-jobs reads already exist (#298)
// and are used as they are: the board is a second consumer of those modules,
// not a second copy of them.
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
// The roster reads and their boundary adaptation are #297's, used the same way
// (#345). The People rail is a second consumer of that module, not a second
// copy of it — same functions, so the same `corpCacheKey` rows and the same
// `detectCorpAuthFailure` treatment of a 403.
import {
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  toMemberActivity,
} from '@/features/corp/members';
import { readPreviousRoster } from '@/features/corp/rosterState';
import { walletDivisions, type WalletDivision } from '@/features/corp/divisions';
import {
  jobTypeIds,
  structureName,
  toBoardExtractions,
  toBoardJobs,
  toBoardStructures,
  toVitalsJournal,
} from '@/features/corp/boardSources';
import { loadTypeNames } from '@/features/character/typeNames';
import { buildCorpBoard } from '@/engine/corp/board';
import { diffRoster, type MemberActivity, type RosterDiff } from '@/engine/corp/members';
import type { VitalsJournalEntry } from '@/engine/corp/vitals';
import type { CorpCapabilities } from '@/engine/corpRoles';
import type {
  CorporationIndustryJob,
  CorporationMiningExtraction,
  CorporationStructure,
} from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

/**
 * How stale this board's data can be — ESI's own `Expires` on the corp
 * endpoints, which is what `esi/cache.ts` resolves `STALE_AFTER` to for them
 * (the window is a floor; whichever is later wins). Sizes the engine's
 * short-timer judgement and is the number the badge's note describes.
 */
const CORP_CACHE_WINDOW_MS = 3_600_000;

/**
 * A panel that could not be read is `null`, never `[]`.
 *
 * The distinction is the whole of AC3: `[]` means "read fine, nothing there"
 * and earns an empty state, while `null` means "this Character cannot see
 * this" and must render nothing at all. Collapsing them would show a Station
 * Manager a "No industry jobs" card about an endpoint they were never allowed
 * to ask.
 */
interface CorpSnapshot {
  corporationId: number | null;
  structures: CorporationStructure[] | null;
  extractions: CorporationMiningExtraction[] | null;
  jobs: CorporationIndustryJob[] | null;
  /** Balances joined to the corporation's own division names (#298). */
  wallets: WalletDivision[] | null;
  journal: VitalsJournalEntry[];
  /** Tracking rows for the People rail, or `null` when unread (#345). */
  members: MemberActivity[] | null;
  /**
   * Joins/leaves since this device last opened the roster — read, never
   * consumed. `null` when the member-id list could not be read, which is not
   * the same answer as an empty diff: see the loader.
   */
  rosterDiff: RosterDiff | null;
  typeNames: ReadonlyMap<number, string>;
  /** Oldest `fetchedAt` across the panels actually read — see `Corp` below. */
  oldestFetchedAt: Date | null;
  /** Captured in the loader: `Date.now()` in render is impure. */
  loadedAt: number;
}

const EMPTY_SNAPSHOT: CorpSnapshot = {
  corporationId: null,
  structures: null,
  extractions: null,
  jobs: null,
  wallets: null,
  journal: [],
  members: null,
  rosterDiff: null,
  typeNames: new Map(),
  oldestFetchedAt: null,
  loadedAt: 0,
};

async function loadCorpSnapshot(
  characterId: number,
  capabilities: CorpCapabilities,
  signal: RouteSnapshotSignal
): Promise<CorpSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  // Without a corporation id there is no corp-scoped cache key to read under,
  // and inventing one would file rows under `corp:undefined:` — a real row that
  // survives a corporation change, which is exactly what #293 exists to stop.
  if (corporationId === null || signal.cancelled) {
    return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };
  }

  // Each read is fired only for the capability that opens it, so an unheld one
  // costs no request rather than a 403.
  const [structures, extractions, jobs, wallets, divisions, journal, roster, tracking] =
    await Promise.all([
      capabilities.canReadStructures
        ? loadCorporationStructures(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadMoonExtractions
        ? loadCorporationMiningExtractions(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadIndustry
        ? loadCorporationIndustryJobs(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadWallet
        ? loadCorporationWallets(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadWallet
        ? loadCorporationDivisions(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadWallet
        ? loadCorporationWalletJournal(characterId, corporationId, MASTER_WALLET_DIVISION)
        : Promise.resolve(null),
      capabilities.canReadMembers
        ? loadCorporationMemberIds(characterId, corporationId)
        : Promise.resolve(null),
      capabilities.canReadMembers
        ? loadCorporationMemberTracking(characterId, corporationId)
        : Promise.resolve(null),
    ]);

  /**
   * The baseline is read and *not* replaced. That is the whole of the summary's
   * agreement with `/corp/members`.
   *
   * `rosterState.ts` stores what this device has already reported, and
   * `CorpMembersView` reads it and records the new roster in the same pass so
   * each change is announced exactly once. If the overview recorded too,
   * whichever surface the user opened first would consume the change and the
   * other would show nothing — the same failure that module's note rules out
   * for #299's background poller.
   *
   * So the overview only ever asks. The figure therefore stands until the user
   * follows the link, which is the right behaviour for a tile whose job is
   * "should I go look": it stops saying so once you have looked, and not before.
   */
  const memberIds = roster?.cached?.data ?? null;
  // `null`, not `EMPTY_ROSTER_DIFF`: an id list we could not read is "unknown",
  // and printing it as "nothing changed" would be the rail stating a fact it
  // does not have. `/corp/members` renders no summary in that case
  // (`isEmptyRosterDiff`), so a confident zero here would be exactly the drift
  // AC2 forbids — with the tracking read still fine, so the rail is up.
  const rosterDiff =
    memberIds === null
      ? null
      : diffRoster(await readPreviousRoster(characterId, corporationId), memberIds);

  const jobRows = jobs?.cached?.data ?? null;
  // Only the type names this board will actually print. `loadTypeNames` reads
  // the SDE snapshot first and only falls back to ESI for what it misses.
  const typeNames = jobRows === null ? new Map() : await loadTypeNames(jobTypeIds(jobRows));

  // The oldest of the panels that were read, not the newest: the badge is a
  // promise about the whole view, and a fresh wallet must not vouch for an
  // hour-old structure list.
  const fetchedAts = [structures, extractions, jobs, wallets, divisions, journal, roster, tracking]
    .map((result) => result?.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const oldestFetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  return {
    corporationId,
    structures: structures?.cached?.data ?? null,
    extractions: extractions?.cached?.data ?? null,
    jobs: jobRows,
    // Driven by the wallet read, not the divisions one: the balances are the
    // data, and `read_divisions` can fail on its own — a missing name degrades
    // one label, a missing division would hide a wallet (`divisions.ts`).
    wallets:
      wallets?.cached === undefined || wallets.cached === null
        ? null
        : walletDivisions(wallets.cached.data, divisions?.cached?.data ?? null),
    journal: toVitalsJournal(journal?.cached?.data ?? []),
    // `null`, not `[]`, for the same reason every other panel here is: a
    // tracking read that did not happen must hide the rail, where a corporation
    // that genuinely returned no rows is a rail reading zero. The member count
    // comes from tracking rather than from the id list because that is what
    // `/corp/members` counts — counting the ids instead would drift from the
    // page this links to whenever the two reads disagree.
    members:
      tracking?.cached === undefined || tracking.cached === null
        ? null
        : toMemberActivity(tracking.cached.data),
    rosterDiff,
    typeNames,
    oldestFetchedAt,
    loadedAt,
  };
}

/**
 * The board proper, mounted only once Corp Access has resolved to `ready`.
 *
 * That split is load-bearing, not tidiness. `useRouteSnapshot` fires its loader
 * on mount and re-runs it only for a character change or a refresh — it reads
 * the loader through a latest-ref, so a loader that *closes over* something
 * changing (here, `capabilities`) never re-runs for that change. On a cold load
 * `useCorpAccess` reports `unknown` with no capabilities for the first frames,
 * so a loader mounted at that moment would fetch nothing and never be asked
 * again: an empty board for every user, permanently.
 *
 * Mounting on `ready` means the first run already has the real capability set.
 * A character switch is covered by the same rule from the other side —
 * `useCorpAccess` returns to `unknown` while the new character's roles read is
 * in flight, so this unmounts and comes back with that character's answer.
 */
function CorpBoardView({ capabilities }: { capabilities: CorpCapabilities }) {
  const { t } = useTranslation();
  const canReadAnything =
    capabilities.canReadStructures ||
    capabilities.canReadMoonExtractions ||
    capabilities.canReadIndustry;

  const snapshot = useRouteSnapshot<CorpSnapshot>((characterId, signal) =>
    loadCorpSnapshot(characterId, capabilities, signal)
  );
  const data = snapshot.data;

  const items = useMemo(() => {
    if (data === null) return [];
    const structures = data.structures ?? [];
    const names = new Map(
      structures.map((structure) => [structure.structure_id, structureName(structure)])
    );
    return buildCorpBoard({
      nowMs: data.loadedAt,
      staleWindowMs: CORP_CACHE_WINDOW_MS,
      // `undefined`, not `[]`: an unreadable source contributes no items and
      // says nothing, where an empty one is a positive statement of "none".
      structures: data.structures === null ? undefined : toBoardStructures(data.structures),
      extractions:
        data.extractions === null ? undefined : toBoardExtractions(data.extractions, names),
      jobs: data.jobs === null ? undefined : toBoardJobs(data.jobs, data.typeNames),
    });
  }, [data]);

  if (!snapshot.hydrated) return <Spinner />;

  const showVitals = capabilities.canReadWallet && data !== null;
  const showPeople = capabilities.canReadMembers && data !== null && data.members !== null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corp.title')}
        meta={
          data?.oldestFetchedAt ? (
            <DataAgeBadge date={data.oldestFetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      <CorpSubNav />

      {snapshot.loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          {/*
            AC3's harder half. "Cannot read" and "read fine, nothing due" are
            different answers and must look different: an Accountant who holds
            none of the board's three capabilities gets no board panel at all,
            while a Station Manager whose structures are simply all healthy gets
            one saying so. Collapsing them would put "Nothing due" in front of
            someone who was never allowed to ask.
          */}
          {canReadAnything && (
            <Panel title={t('corp.boardTitle')} padded={false}>
              <CorpBoard items={items} />
            </Panel>
          )}
          {/*
            Money and People, the two halves of the side rail — each simply
            absent without its capability, no placeholder and no "you cannot
            see this". Their own reads were never fired either (see the loader).

            The pair share the one 18rem grid cell rather than taking a cell
            each, which is what keeps the board's own column full width. They
            sit side by side wherever there is room for it and stack where
            there is not — which includes `lg` and up, where the column is
            the fixed 18rem track: two ~9rem columns would overflow, since a
            `StatChip` and the rail's ISK figures are `shrink-0` by contract.
            The two-column class is also conditional on both rails actually
            rendering, so a wallet-only Character's Money rail keeps the full
            width it had before this pair existed.
          */}
          {(showVitals || showPeople) && data !== null && (
            <div
              className={cx(
                'grid gap-3',
                showVitals && showPeople && 'sm:grid-cols-2 lg:grid-cols-1'
              )}
            >
              {showVitals && (
                <CorpVitalsRail
                  divisions={data.wallets ?? []}
                  journal={data.journal}
                  journalDivision={MASTER_WALLET_DIVISION}
                  nowMs={data.loadedAt}
                />
              )}
              {showPeople && (
                <CorpPeopleRail
                  members={data.members ?? []}
                  diff={data.rosterDiff}
                  nowMs={data.loadedAt}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Corp() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate();

  // Still resolving. This is the one place corp UI treats `unknown` as its own
  // state rather than as `none`: the nav hides so it cannot flicker, but
  // bouncing a Director who deep-linked before their roles read landed would
  // simply be a bug. See `useCorpRouteGate`.
  if (gate.status === 'loading') return <Spinner />;

  // Reached the URL without the access for it. A bare explanation, not the
  // section's shell drawn over nothing — that would be a lock, and corp UI
  // hides rather than locks (CONTEXT.md round 35). Settings' Corp access row is
  // where the two-axis gate is actually explained and, where possible, fixed.
  if (gate.status === 'denied') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('corp.title')} />
        <EmptyState title={t('corp.noAccessTitle')} hint={t('corp.noAccessHint')} />
      </div>
    );
  }

  return <CorpBoardView capabilities={gate.capabilities} />;
}
