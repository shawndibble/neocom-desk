/**
 * `/corp/members` — who is in this corporation, and are they still here.
 *
 * The one question no other view in the app can answer. Every other page is
 * about what a Character owns; this one is about people, and about the people
 * who have stopped showing up in particular — which is why the table opens
 * sorted by the longest silence rather than alphabetically.
 *
 * **Director-only, and the whole page rather than a panel.** `membertracking`
 * declares `Director` in ESI's `x-required-roles` and nothing else, so
 * `canReadMembers` maps to that one role (`engine/corpRoles.ts`) and an
 * Accountant gets nothing useful here at all. `/corp` degrades panel by panel
 * because its panels answer to four different roles; this page has exactly one
 * gate, so it hides whole (CONTEXT.md round 35) rather than rendering a shell
 * over a permission no login can grant.
 *
 * The `unknown` / `ready` asymmetry and the mount-on-`ready` split are
 * `useCorpRouteGate`'s, shared with `/corp` and `/corp/assets` — see that hook.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import {
  CorpRosterStats,
  CorpRosterSummary,
  CorpRosterTable,
  type RosterRow,
} from '@/features/corp/CorpRoster';
import { MemberContextMenu } from '@/features/corp/MemberContextMenu';
import { membersCsvColumns } from '@/features/corp/membersCsv';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_MEMBER_LABELS,
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  loadMemberLabels,
  toMemberActivity,
  type MemberLabels,
} from '@/features/corp/members';
import { readPreviousRoster, recordRoster } from '@/features/corp/rosterState';
import {
  EMPTY_ROSTER_DIFF,
  diffRoster,
  filterRosterRows,
  label,
  memberStanding,
  type MemberActivity,
  type RosterDiff,
} from '@/engine/corp/members';
import { downloadCsv } from '@/lib/downloadCsv';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

/** Same debounce shape as `CorpAssets.tsx`/`Assets.tsx`: the input stays responsive, only the filter waits. */
const SEARCH_DEBOUNCE_MS = 250;

interface MembersSnapshot {
  corporationId: number | null;
  members: MemberActivity[];
  labels: MemberLabels;
  diff: RosterDiff;
  /** Oldest `fetchedAt` across the two reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
  /** Captured in the loader: `Date.now()` in render is impure. */
  loadedAt: number;
}

const EMPTY_SNAPSHOT: MembersSnapshot = {
  corporationId: null,
  members: [],
  labels: EMPTY_MEMBER_LABELS,
  diff: EMPTY_ROSTER_DIFF,
  fetchedAt: null,
  loadedAt: 0,
};

async function loadMembersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<MembersSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  // No corporation id means no corp-scoped cache key to read under; inventing
  // one would file rows as `corp:undefined:` (#293).
  if (corporationId === null || signal.cancelled) {
    return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };
  }

  const [roster, tracking] = await Promise.all([
    loadCorporationMemberIds(characterId, corporationId),
    loadCorporationMemberTracking(characterId, corporationId),
  ]);

  const memberIds = roster.cached?.data ?? null;
  // The baseline is read *and* replaced in the same pass, so the summary
  // reports each change exactly once. Two things must not consume it:
  //
  // - A roster we could not read at all. Overwriting the baseline with nothing
  //   would silently swallow every change made since the last successful read.
  // - A run whose result is about to be thrown away. `useRouteSnapshot`
  //   discards a stale response, but a write already made is not discarded with
  //   it — a cancelled run would consume the change and the user would never see
  //   the summary. Skipping the write is the safe direction: the next run diffs
  //   against the older baseline and reports the change again.
  let diff = EMPTY_ROSTER_DIFF;
  if (memberIds !== null) {
    diff = diffRoster(await readPreviousRoster(characterId, corporationId), memberIds);
    if (!signal.cancelled) await recordRoster(characterId, corporationId, memberIds, loadedAt);
  }

  const members = toMemberActivity(tracking.cached?.data ?? []);
  // Members who left are in neither read any more, so their names are asked for
  // explicitly — the summary is the only place they appear.
  const labels = await loadMemberLabels(characterId, members, diff.left);

  const fetchedAts = [roster, tracking]
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const fetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  return { corporationId, members, labels, diff, fetchedAt, loadedAt };
}

/** Mounted only once Corp Access is `ready` — see the `/corp` loader note. */
function CorpMembersView() {
  const { t } = useTranslation();
  const snapshot = useRouteSnapshot<MembersSnapshot>(loadMembersSnapshot, undefined, {
    // Keeps the roster on screen during a manual refresh (issue #418).
    staleWhileRevalidate: true,
  });
  const data = snapshot.data;

  const rows = useMemo<RosterRow[]>(() => {
    if (data === null) return [];
    return data.members.map((member) => ({
      characterId: member.characterId,
      name: data.labels.characters.get(member.characterId) ?? null,
      standing: memberStanding(member, data.loadedAt),
      shipTypeId: member.shipTypeId,
      shipName:
        member.shipTypeId === null ? null : (data.labels.ships.get(member.shipTypeId) ?? null),
      locationId: member.locationId,
      locationName:
        member.locationId === null ? null : (data.labels.locations.get(member.locationId) ?? null),
      startMs: member.startMs,
    }));
  }, [data]);

  // Search + dark-only filter (issue #421, AC2/AC3): AND-composed, same
  // stacking rule as Mail's search-and-label filters (CONTEXT.md round 55).
  // The stat strip's dark count stays computed from the full roster — only
  // the table narrows.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);
  const [darkOnly, setDarkOnly] = useState(false);
  const visibleRows = useMemo(() => {
    const searched = filterRosterRows(rows, debouncedSearch);
    return darkOnly ? searched.filter((row) => row.standing.isDark) : searched;
  }, [rows, debouncedSearch, darkOnly]);

  // Row context menu (issue #421, AC1): the shared Public Info Modal is the
  // one entry point, same as every other list with a Show Info action.
  function memberRowContextMenu(row: RosterRow, tr: ReactElement) {
    return (
      <MemberContextMenu characterId={row.characterId} name={label(row.name, row.characterId)}>
        {tr}
      </MemberContextMenu>
    );
  }

  if (!snapshot.hydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corp.members.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.members.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      <CorpSubNav />

      {snapshot.loading && data === null ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('corp.members.searchPlaceholder')}
          />
          <Panel padded={false}>
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CorpRosterStats
                  rows={rows}
                  darkOnly={darkOnly}
                  onToggleDarkOnly={() => setDarkOnly((value) => !value)}
                />
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('corp.members.exportCsv')}
                  disabled={visibleRows.length === 0}
                  onClick={() => downloadCsv('corp-members', visibleRows, membersCsvColumns(t))}
                />
              </div>
              <CorpRosterSummary
                diff={data?.diff ?? EMPTY_ROSTER_DIFF}
                names={data?.labels.characters ?? EMPTY_MEMBER_LABELS.characters}
              />
            </div>
            <CorpRosterTable rows={visibleRows} rowContextMenu={memberRowContextMenu} />
          </Panel>
        </div>
      )}
    </div>
  );
}

export function CorpMembers() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadMembers);

  if (gate.status === 'loading') return <Spinner />;

  if (gate.status === 'denied') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('corp.members.title')} />
        <EmptyState title={t('corp.members.noAccessTitle')} hint={t('corp.members.noAccessHint')} />
      </div>
    );
  }

  return <CorpMembersView />;
}
