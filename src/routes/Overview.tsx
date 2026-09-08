/**
 * The triage board: what needs you, right now, across every domain the app
 * covers.
 *
 * This replaces a dashboard that showed a wallet balance, a training queue and
 * three count tiles — figures that were true but that nobody opens a dashboard
 * to read. The question this page is actually asked is "is there anything I
 * have to do before I log off", and every card answers it for one domain and
 * links straight to the page that fixes it.
 *
 * **The one rule: numbers where the items are interchangeable, rows only where
 * each item is genuinely its own thing.** Twenty-one orders can be undercut at
 * once, colonies get reset in one sitting so a batch of them shares a timer,
 * and alert volume runs to the hundreds. A board that prints a row per item is
 * unusable on exactly the days it matters — so orders and mining tax are
 * counts, planetary is one row per *reset run*, industry is real rows, and
 * alerts get a column of their own so a loud day cannot push the rest of the
 * board around.
 *
 * Every card renders in every state, including the boring one. A card that
 * disappears when there is nothing wrong is a card you cannot tell from a card
 * that failed to load.
 *
 * Scoped to the active Character, with one exception: the alert feed is
 * device-wide, because the poller is (`features/notifications/`).
 */
import { Fragment, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Spinner } from '@/components/ui';
import type { CachedResult } from '@/features/skills/data';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { maxMarketOrders } from '@/engine/market/orderSlots';
import { rememberSpSummary, getLastKnownSpSummary } from '@/stores/characterSp';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { buildOpenOrderRows } from '@/features/market/openOrdersModel';
import { alertGroupLabel, groupAlertsByType } from '@/features/notifications/alertGroups';
import type { DisplayAlertGroup } from '@/features/notifications/alertsFilter';
import { readFeed, dismissFeedEntries } from '@/features/notifications/feed';
import { visibleFeedEntries } from '@/features/notifications/feedSelection';
import { useNotificationPreferences } from '@/features/notifications/preferences';
import { SummaryStrip } from '@/features/overview/SummaryStrip';
import {
  AlertsColumn,
  IndustryCard,
  MiningTaxCard,
  OrdersCard,
  PlanetaryCard,
} from '@/features/overview/cards';
import {
  loadIndustryBoard,
  loadMiningTaxBoard,
  loadPlanetaryBoard,
} from '@/features/overview/boardData';
import {
  industrySeverity,
  miningTaxSeverity,
  ordersSeverity,
  planetarySeverity,
} from '@/features/overview/boardSeverity';
import { compareSeverity, type DeadlineSeverity } from '@/engine/severity';
import { isJobDone } from '@/features/industry/jobs';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { sortQueueEntries, selectActiveEntryFromSorted, selectQueueDepth } from './overviewQueue';

/** Stable identity, so the industry card does not re-render on every parent render before its load lands. */
const EMPTY_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * Written out rather than built from the index: Tailwind scans source for
 * literal class names, so `order-${i}` would emit nothing at all.
 */
const NARROW_ORDER = [
  'order-1 sm:order-none',
  'order-2 sm:order-none',
  'order-3 sm:order-none',
  'order-4 sm:order-none',
];

interface WalletPanelData {
  result: CachedResult<number> | null;
  needsReauth: boolean;
}

async function loadWalletPanel(characterId: number): Promise<WalletPanelData> {
  const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
  return { result: cached, needsReauth };
}

interface SkillsQueuePanelData {
  skillsResult: CachedResult<CharacterSkills> | null;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  queueNeedsReauth: boolean;
  totalSp: number | null;
  catalog: SkillCatalog;
  /**
   * Open-order ceiling for the Open Orders card's footer. Derived here rather
   * than in its own snapshot: the Trade-group skill levels it needs are
   * already in this load's corrected skills, so it costs no extra ESI read.
   * Null until /skills has landed — an untrained character still has slots, so
   * "5" and "not loaded yet" must not look alike.
   */
  maxOrders: number | null;
}

async function loadSkillsQueuePanel(characterId: number): Promise<SkillsQueuePanelData> {
  const [corrected, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  // Feeds the same cache `characterSp.ts` keeps for Clones/Employment History,
  // so switching to either of those tabs can seed the shared header from this
  // read instead of blanking it while its own load is in flight.
  rememberSpSummary(characterId, {
    totalSp: corrected.totalSp,
    unallocatedSp: corrected.skillsResult?.data.unallocated_sp ?? null,
  });
  return {
    skillsResult: corrected.skillsResult,
    queueResult: corrected.queueResult,
    queueNeedsReauth: corrected.queueNeedsReauth,
    totalSp: corrected.totalSp,
    catalog,
    maxOrders: corrected.skillsResult ? maxMarketOrders(corrected.trained) : null,
  };
}

/**
 * Deferred for the reason `boardData.ts` sets out: this route is what the app
 * opens on, so its static imports are in the way of every first paint, and the
 * Orders fetch layer reaches type names, corrected skills, the NPC station
 * table, cost bases and the competition loaders for three counts.
 *
 * Declared at module scope, not inline, so `useRouteSnapshot` is handed one
 * stable function — and it closes over nothing but its arguments, which is
 * that hook's stated contract.
 */
function loadOrdersBoard(characterId: number, signal: RouteSnapshotSignal) {
  return import('@/features/market/openOrdersPageSnapshot').then((m) =>
    m.loadOpenOrdersSnapshot(characterId, signal)
  );
}

/** The oldest of the board's own reads — a countdown is only as fresh as the fetch it was computed from. */
function stalest(dates: readonly (Date | null | undefined)[]): Date | null {
  const known = dates.filter((date): date is Date => date instanceof Date);
  if (known.length === 0) return null;
  return known.reduce((oldest, date) => (date < oldest ? date : oldest));
}

export function Overview() {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);

  // One `cacheKey` per card, not one for the page: they load independently, so
  // a return visit restores each as soon as that card's own last result exists
  // rather than waiting on the slowest.
  const walletSnapshot = useRouteSnapshot(loadWalletPanel, undefined, {
    cacheKey: 'overview:wallet',
  });
  const skillsQueueSnapshot = useRouteSnapshot(loadSkillsQueuePanel, undefined, {
    cacheKey: 'overview:skill-queue',
  });
  const ordersSnapshot = useRouteSnapshot(loadOrdersBoard, undefined, {
    cacheKey: 'overview:orders',
  });
  const miningSnapshot = useRouteSnapshot(loadMiningTaxBoard, undefined, {
    cacheKey: 'overview:mining-tax',
  });
  const planetarySnapshot = useRouteSnapshot(loadPlanetaryBoard, undefined, {
    cacheKey: 'overview:planetary',
  });
  const industrySnapshot = useRouteSnapshot(loadIndustryBoard, undefined, {
    cacheKey: 'overview:industry',
  });
  const { hydrated, activeCharacterId } = walletSnapshot;

  const queueEntries = skillsQueueSnapshot.data?.queueResult?.data ?? null;
  // Sorted once per fetched queue rather than on every render (this component
  // re-renders on unrelated state, e.g. the alert feed) — the depth and
  // active-entry reads below both consume this same sort.
  const sortedQueue = useMemo(
    () => (queueEntries ? sortQueueEntries(queueEntries) : null),
    [queueEntries]
  );

  const orderRows = useMemo(() => {
    const snapshot = ordersSnapshot.data;
    if (!snapshot) return [];
    /*
     * Narrowed to the active Character below. `loadOpenOrdersSnapshot` fans out
     * across every Character because it backs the cross-character Orders page;
     * this board is one pilot's, like every other card on it, and the tile it
     * replaced read `loadOrders(characterId)`. Filtering the built rows rather
     * than the snapshot keeps the one loader shared — and costs nothing, since
     * the other Characters' orders were already fetched for the page's cache.
     */
    /*
     * Deliberately without `deepCompetition`/`structureCompetition`: those are
     * per-order region and structure book fetches the Orders page issues when a
     * row is opened. The board is a summary — an order beaten at its own
     * station is already undercut — and a dashboard is not the place to spend
     * dozens of extra ESI calls sharpening a count you are about to click
     * through anyway.
     */
    return buildOpenOrderRows({
      snapshot: snapshot.openOrders,
      typeNames: snapshot.typeNames,
      stationPrices: snapshot.stationPrices,
      costBases: snapshot.costBases,
      stationNames: new Map([...snapshot.npcStations].map(([id, s]) => [id, s.name])),
      skillsByCharacter: snapshot.skillsByCharacter,
      now: snapshot.now,
    }).filter((row) => row.characterId === activeCharacterId);
  }, [ordersSnapshot.data, activeCharacterId]);

  /*
   * Whether *this* Character's orders could be read — not whether any could.
   * A snapshot with no entry for them at all means the grant was never given
   * (`openOrdersData.ts` lists those in `skipped` rather than fetching them).
   */
  const ordersNeedReauth = useMemo(() => {
    const snapshot = ordersSnapshot.data;
    if (!snapshot || activeCharacterId === null) return false;
    const entry = snapshot.openOrders.entries.find(
      (candidate) => candidate.characterId === activeCharacterId
    );
    return entry === undefined || entry.needsReauth;
  }, [ordersSnapshot.data, activeCharacterId]);

  const storedFeed = useLiveQuery(() => readFeed(), [], []);
  const visibleAlerts = useMemo(
    () => visibleFeedEntries(storedFeed, prefsValue),
    [storedFeed, prefsValue]
  );
  const alertGroups = useMemo<DisplayAlertGroup[]>(
    () =>
      groupAlertsByType(visibleAlerts).map((group) => ({
        ...group,
        label: alertGroupLabel(t, group.target),
        // Everything here passed `visibleFeedEntries`, so nothing in it is
        // muted. Muted types are reachable on the Alerts page, which is where
        // un-muting one has to happen.
        muted: false,
      })),
    [visibleAlerts, t]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const skillsQueueData = skillsQueueSnapshot.data;
  const catalog = skillsQueueData?.catalog ?? null;
  const lastKnownSp = getLastKnownSpSummary(activeCharacterId);

  // Reads the wall clock to pick "the entry training right now" and to age
  // every countdown on the board — unavoidably impure, but it only affects
  // what is displayed, never a cached value.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const now = Date.now();
  const activeEntry = sortedQueue ? selectActiveEntryFromSorted(sortedQueue, now) : null;
  const activeSkillName =
    activeEntry && catalog
      ? (catalog.bySkillTypeID.get(activeEntry.skill_id)?.name ?? `#${activeEntry.skill_id}`)
      : null;
  const queueDepth = sortedQueue ? selectQueueDepth(sortedQueue, now) : null;
  const trainingFinishMs = activeEntry?.finish_date ? Date.parse(activeEntry.finish_date) : null;

  const planetary = planetarySnapshot.data;
  const industryJobs = industrySnapshot.data?.jobs ?? [];

  /*
   * The next deadline is drawn from the cards below rather than computed on its
   * own: it is the soonest live clock on the board, so clicking it lands on
   * whichever card owns it. A fourth independent countdown here would be a
   * number the rest of the page could contradict.
   */
  const deadlines: { at: number; note: string; severity: DeadlineSeverity; to: string }[] = [];
  const nextBatch = planetary?.batches.find((batch) => batch.kind === 'running');
  if (nextBatch?.expiryMs) {
    deadlines.push({
      at: nextBatch.expiryMs,
      note: t('overview.board.batch.running', { count: nextBatch.colonies.length }),
      severity: nextBatch.severity,
      to: '/planetary-industry',
    });
  }
  const nextJobMs = industryJobs
    .filter((job) => !isJobDone(job, now))
    .map((job) => Date.parse(job.end_date))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b)[0];
  if (nextJobMs !== undefined) {
    deadlines.push({
      at: nextJobMs,
      note: t('overview.board.nextJob'),
      severity: 'watch',
      to: '/industry',
    });
  }
  if (trainingFinishMs !== null && trainingFinishMs > now) {
    deadlines.push({
      at: trainingFinishMs,
      note: t('overview.board.nextSkill'),
      severity: 'clear',
      to: '/skills/plans',
    });
  }
  const soonest = deadlines.sort((a, b) => a.at - b.at)[0] ?? null;

  const walletBalance = walletSnapshot.data?.result?.data ?? null;

  /*
   * Worst first, but only where it pays. Below `sm` the cards stack in one
   * column and about three fit above the fold, so the thing on fire has to
   * lead; from `sm` up the whole grid is on screen at once and a position that
   * stays put between visits is worth more than a ranking nobody has to scroll
   * to. `sm:order-none` is what hands the fixed order back.
   *
   * A null severity (still loading) sorts last rather than as `clear`: a card
   * that has made no claim yet must not jump the queue on a guess and
   * reshuffle the stack under the reader's thumb as each load lands.
   */
  const cards = [
    {
      key: 'orders',
      severity: ordersSeverity(orderRows, ordersNeedReauth),
      render: (className: string) => (
        <OrdersCard
          className={className}
          rows={orderRows}
          maxOrders={skillsQueueData?.maxOrders ?? null}
          needsReauth={ordersNeedReauth}
        />
      ),
    },
    {
      key: 'mining',
      severity: miningTaxSeverity(miningSnapshot.data),
      render: (className: string) => (
        <MiningTaxCard className={className} data={miningSnapshot.data} />
      ),
    },
    {
      key: 'planetary',
      severity: planetarySeverity(planetary),
      render: (className: string) => <PlanetaryCard className={className} data={planetary} />,
    },
    {
      key: 'industry',
      severity: industrySeverity(industryJobs, industrySnapshot.data?.needsReauth ?? false, now),
      render: (className: string) => (
        <IndustryCard
          className={className}
          jobs={industryJobs}
          productNames={industrySnapshot.data?.productNames ?? EMPTY_NAMES}
          needsReauth={industrySnapshot.data?.needsReauth ?? false}
          nowMs={now}
        />
      ),
    },
  ];
  const rank = new Map(
    [...cards]
      .sort((a, b) =>
        a.severity === null || b.severity === null
          ? Number(a.severity === null) - Number(b.severity === null)
          : compareSeverity(a.severity, b.severity)
      )
      .map((card, i) => [card.key, i])
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={skillsQueueData?.totalSp ?? lastKnownSp.totalSp}
        unallocatedSp={
          skillsQueueData?.skillsResult?.data?.unallocated_sp ?? lastKnownSp.unallocatedSp
        }
      />
      <OverviewSubNav />

      <SummaryStrip
        deadline={
          soonest === null
            ? null
            : {
                label: formatDuration(Math.max(0, soonest.at - now) / 1000),
                note: soonest.note,
                severity: soonest.severity,
                to: soonest.to,
              }
        }
        trainingUnavailable={skillsQueueData?.queueNeedsReauth ?? false}
        walletUnavailable={walletSnapshot.data?.needsReauth ?? false}
        failed={Boolean(walletSnapshot.error)}
        training={
          activeSkillName === null
            ? null
            : {
                label: activeSkillName,
                note: [
                  trainingFinishMs === null
                    ? null
                    : t('overview.timeLeft', {
                        duration: formatDuration(Math.max(0, trainingFinishMs - now) / 1000),
                      }),
                  queueDepth ? t('overview.board.queued', { count: queueDepth.count }) : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                to: '/skills/plans',
              }
        }
        wallet={
          walletBalance === null
            ? null
            : { label: `${formatIsk(walletBalance, 2)} ${t('overview.isk')}`, to: '/wallet' }
        }
        fetchedAt={stalest([
          walletSnapshot.data?.result?.fetchedAt,
          skillsQueueSnapshot.data?.queueResult?.fetchedAt,
          planetarySnapshot.data?.fetchedAt,
          industrySnapshot.data?.fetchedAt,
          miningSnapshot.data?.fetchedAt,
        ])}
        onRefresh={() => {
          walletSnapshot.refresh();
          skillsQueueSnapshot.refresh();
          ordersSnapshot.refresh();
          miningSnapshot.refresh();
          planetarySnapshot.refresh();
          industrySnapshot.refresh();
        }}
        refreshing={
          walletSnapshot.loading ||
          planetarySnapshot.loading ||
          industrySnapshot.loading ||
          ordersSnapshot.loading ||
          miningSnapshot.loading
        }
      />

      {/*
        Two columns: the domain cards, and alerts beside them at full height.
        `items-start` is deliberately absent — the grid's default `stretch` is
        what gives the cards in one row a common bottom edge, and a pair at
        different heights reads as one of them having failed to load.
      */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {/* Every card renders unconditionally, mid-load included. Gating one
              on its own data would make "still loading" and "nothing here"
              look identical to "this domain does not exist" — which is the
              failure this board was rebuilt to avoid. */}
          {cards.map(({ key, render }) => (
            <Fragment key={key}>{render(NARROW_ORDER[rank.get(key) ?? 0])}</Fragment>
          ))}
        </div>
        <AlertsColumn
          groups={alertGroups}
          unread={visibleAlerts.length}
          onDismissAll={() => void dismissFeedEntries(visibleAlerts.map((entry) => entry.id))}
        />
      </div>
    </div>
  );
}
