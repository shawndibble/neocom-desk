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
 * that failed to load. The one way a card leaves is the pilot switching it off
 * from the edit menu (`features/overview/hiddenCards.ts`) — a choice they made,
 * synced across devices and Characters, not a state the board guessed at.
 *
 * Scoped to the active Character, with two exceptions: the alert feed is
 * device-wide, because the poller is (`features/notifications/`), and the
 * Structures and Moon extractions cards are the Character's corporation's,
 * read through that Character's roles.
 */
import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
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
import { formatCountdown } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { buildOpenOrderRows } from '@/features/market/openOrdersModel';
import { alertGroupLabel, groupAlertsByType } from '@/features/notifications/alertGroups';
import type { DisplayAlertGroup } from '@/features/notifications/alertsFilter';
import { readFeed } from '@/features/notifications/feed';
import { dismissFeedEntriesAndSync } from '@/features/notifications/feedSync';
import { visibleFeedEntries } from '@/features/notifications/feedSelection';
import {
  useNotificationPreferences,
  isNotTrainingAlertEnabledFor,
} from '@/features/notifications/preferences';
import { SummaryStrip } from '@/features/overview/SummaryStrip';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { CardPicker } from '@/features/overview/CardPicker';
import {
  moonChunkSeverity,
  moonChunksDeadline,
  moonChunksSeverity,
  structuresDeadline,
  structuresSeverity,
  structuresView,
} from '@/features/overview/corpCards';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import {
  layoutBoard,
  soonestDeadline,
  type BoardCardSpec,
  type BoardDeadline,
} from '@/features/overview/boardLayout';
import {
  isCardShown,
  OVERVIEW_CARD_LABEL,
  toggleHiddenCard,
  useOverviewHiddenCards,
  type OverviewCardKey,
} from '@/features/overview/hiddenCards';
import {
  AlertsColumn,
  CONTRACTS_IN_PROGRESS_HREF,
  ComingUpCard,
  ContractsCard,
  MailCard,
  MoonChunksCard,
  StructuresCard,
  PriceAlertsCard,
  SpExtractionCard,
  EverythingElseCard,
  IndustryCard,
  MiningTaxCard,
  OrdersCard,
  PlanetaryCard,
  type FoldedDomain,
} from '@/features/overview/cards';
import {
  loadCalendarEventsBoard,
  loadContractsBoard,
  loadIndustryBoard,
  loadMailBoard,
  loadMoonChunksBoard,
  loadStructuresBoard,
  loadMiningTaxBoard,
  loadPlanetaryBoard,
  loadPriceAlertsBoard,
} from '@/features/overview/boardData';
import {
  comingUpSeverity,
  contractsSeverity,
  industrySeverity,
  mailSeverity,
  miningTaxSeverity,
  ordersSeverity,
  planetarySeverity,
  priceAlertsSeverity,
  spExtractionSeverity,
} from '@/features/overview/boardSeverity';
import {
  alertsSummary,
  comingUpSummary,
  contractsDeadlineNote,
  contractsSummary,
  industrySummary,
  mailSummary,
  moonChunksSummary,
  structuresSummary,
  miningTaxSummary,
  ordersSummary,
  planetarySummary,
  priceAlertsSummary,
  spExtractionSummary,
} from '@/features/overview/boardSummary';
import { severityForRemaining, worstSeverity } from '@/engine/severity';
import { soonestCalendarDeadline } from '@/engine/calendarDeadline';
import { useIsPhone } from '@/lib/useIsPhone';
import { isJobDone } from '@/features/industry/jobs';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { sortQueueEntries, selectActiveEntryFromSorted, selectQueueDepth } from './overviewQueue';

/** A card as the route declares it: the layout's spec plus what the page renders. */
interface RouteCard extends BoardCardSpec {
  to: string;
  summary: string;
  danger?: boolean;
  /** Absent for Alerts, whose desktop form is the column rather than a card. */
  render?: () => ReactNode;
  fetchedAt?: Date | null;
  loading: boolean;
}

/** Stable identity, so the industry card does not re-render on every parent render before its load lands. */
const EMPTY_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * How many cards keep their full shape on a phone. Two, from the mockup
 * (`design/overview-triage`, tagged): about three cards fit above the fold at
 * 390px, and the third slot is what "Everything else" occupies — a domain
 * summarised in one line you can still see beats a third card you have to
 * scroll to.
 */
const PHONE_FULL_COUNT = 2;

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
  const isPhone = useIsPhone();
  const hiddenCards = useOverviewHiddenCards((state) => state.value);
  const hiddenCardsHydrated = useOverviewHiddenCards((state) => state.hydrated);
  const hydrateHiddenCards = useOverviewHiddenCards((state) => state.hydrate);
  const setHiddenCards = useOverviewHiddenCards((state) => state.setValue);
  const spMonitoring = useSpExtractionMonitoringEnabled((state) => state.value);
  const spThreshold = useSpExtractionThresholdSp((state) => state.value);
  const hydrateSpMonitoring = useSpExtractionMonitoringEnabled((state) => state.hydrate);
  const hydrateSpThreshold = useSpExtractionThresholdSp((state) => state.hydrate);
  useEffect(() => {
    void hydrateHiddenCards();
    void hydrateSpMonitoring();
    void hydrateSpThreshold();
  }, [hydrateHiddenCards, hydrateSpMonitoring, hydrateSpThreshold]);
  const shown = (key: OverviewCardKey) => isCardShown(hiddenCards, key);

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
  const contractsSnapshot = useRouteSnapshot(loadContractsBoard, undefined, {
    cacheKey: 'overview:contracts',
  });
  const calendarSnapshot = useRouteSnapshot(loadCalendarEventsBoard, undefined, {
    cacheKey: 'overview:calendar',
  });
  const mailSnapshot = useRouteSnapshot(loadMailBoard, undefined, {
    cacheKey: 'overview:mail',
  });
  const priceAlertsSnapshot = useRouteSnapshot(loadPriceAlertsBoard, undefined, {
    cacheKey: 'overview:price-alerts',
  });
  const structuresSnapshot = useRouteSnapshot(loadStructuresBoard, undefined, {
    cacheKey: 'overview:structures',
  });
  const moonSnapshot = useRouteSnapshot(loadMoonChunksBoard, undefined, {
    cacheKey: 'overview:moon-chunks',
  });
  const corpAccess = useCorpAccess();
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
    // Null, not `[]`: "no open orders" and "the read has not landed" are the
    // same empty list, and the card's severity ranks the phone's stack on the
    // difference.
    if (!snapshot) return null;
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
      walletBasisGaps: snapshot.walletBasisGaps,
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

  // Waits on the hidden-card list too, a local Dexie read, so a hidden card
  // does not flash in and back out on every visit.
  if (!hydrated || !hiddenCardsHydrated) {
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
  // `skillsQueueData === null` also covers "hasn't loaded yet" (RouteSnapshot's
  // own doc comment), not just a genuinely empty queue — without this guard, a
  // slow first load would flash the warning-tone "not training" cell below
  // before the real queue lands, rather than the neutral loading state it used
  // to show.
  const notTrainingAlertEnabled =
    skillsQueueData !== null && isNotTrainingAlertEnabledFor(prefsValue, activeCharacterId);

  const planetary = planetarySnapshot.data;
  const industryJobs = industrySnapshot.data?.jobs ?? [];

  const contracts = contractsSnapshot.data;
  const contractsNote = contracts ? contractsDeadlineNote(t, contracts) : null;
  const soonestContract = contracts?.summary.soonest;
  const nextBatch = planetary?.batches.find((batch) => batch.kind === 'running');
  const nextJobMs = industryJobs
    .filter((job) => !isJobDone(job, now))
    .map((job) => Date.parse(job.end_date))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b)[0];
  const spExtraction = {
    totalSp: skillsQueueData?.totalSp ?? null,
    monitoring: spMonitoring,
    thresholdSp: spThreshold,
  };
  const structures = structuresSnapshot.data ? structuresView(structuresSnapshot.data, now) : null;
  const structureClock = structures?.items ? structuresDeadline(structures.items, now) : null;
  const nextChunk = moonSnapshot.data?.chunks
    ? moonChunksDeadline(moonSnapshot.data.chunks, now)
    : null;
  const calendarEvent = soonestCalendarDeadline(calendarSnapshot.data?.events ?? [], now);

  /*
   * Every card, declared once. Where each one goes (the desktop grid, a
   * phone's two full slots, the folded list) and which clock leads the
   * summary strip are derived from this list (`features/overview/boardLayout`).
   *
   * Worst first, but only where it pays. On a phone the cards stack in one
   * column and about three fit above the fold, so the thing on fire has to
   * lead — and everything past `PHONE_FULL_COUNT` folds to a single line in
   * "Everything else". From `sm` up the whole grid is on screen at once, and a
   * position that stays put between visits is worth more than a ranking nobody
   * has to scroll to: there the declaration order below is what renders.
   *
   * Contracts is `folded`: on a phone it is always a folded row (a courier is
   * one line), and on desktop it takes the slot after Mining Tax. It is not a
   * domain competing for a phone's two full cards.
   *
   * Alerts leads the folded list instead of competing for a full card, and is
   * never ranked against the others. It is the one row here that is
   * device-wide rather than this Character's, and its volume class is
   * different from everything else on the board — the reason it has a column
   * of its own rather than a card. Letting it into the ranking would mean one
   * loud evening pushes both genuine deadlines off the top of a phone.
   *
   * The next deadline is drawn from these cards rather than computed on its
   * own: it is the soonest live clock on the board, so clicking it lands on
   * whichever card owns it. A card the pilot hid contributes none.
   */
  const specs: RouteCard[] = [
    {
      key: 'orders',
      placement: 'ranked',
      to: '/market/orders',
      severity: ordersSeverity(orderRows, ordersNeedReauth),
      summary: ordersSummary(t, orderRows, ordersNeedReauth),
      loading: ordersSnapshot.loading,
      render: () => (
        <OrdersCard
          rows={orderRows ?? []}
          characterId={activeCharacterId}
          maxOrders={skillsQueueData?.maxOrders ?? null}
          needsReauth={ordersNeedReauth}
        />
      ),
    },
    {
      key: 'mining',
      placement: 'ranked',
      to: '/mining/tax',
      severity: miningTaxSeverity(miningSnapshot.data),
      summary: miningTaxSummary(t, miningSnapshot.data),
      fetchedAt: miningSnapshot.data?.fetchedAt,
      loading: miningSnapshot.loading,
      render: () => <MiningTaxCard data={miningSnapshot.data} />,
    },
    {
      key: 'contracts',
      placement: 'folded',
      to: CONTRACTS_IN_PROGRESS_HREF,
      severity: contractsSeverity(contracts),
      summary: contractsSummary(t, contracts, now),
      danger: (contracts?.summary.overdue ?? 0) > 0,
      fetchedAt: contractsSnapshot.data?.fetchedAt,
      loading: contractsSnapshot.loading,
      deadline:
        soonestContract && contractsNote !== null
          ? {
              at: soonestContract.atMs,
              note: contractsNote,
              severity: soonestContract.overdue ? 'critical' : 'warning',
              to: CONTRACTS_IN_PROGRESS_HREF,
            }
          : null,
      render: () => <ContractsCard data={contracts} />,
    },
    {
      key: 'planetary',
      placement: 'ranked',
      to: '/planetary-industry',
      severity: planetarySeverity(planetary),
      summary: planetarySummary(t, planetary),
      fetchedAt: planetarySnapshot.data?.fetchedAt,
      loading: planetarySnapshot.loading,
      deadline: nextBatch?.expiryMs
        ? {
            at: nextBatch.expiryMs,
            note: t('overview.board.batch.running', { count: nextBatch.colonies.length }),
            severity: nextBatch.severity,
            to: '/planetary-industry',
          }
        : null,
      render: () => <PlanetaryCard data={planetary} />,
    },
    {
      key: 'industry',
      placement: 'ranked',
      to: '/industry',
      severity: industrySeverity(industryJobs, industrySnapshot.data?.needsReauth ?? false, now),
      summary: industrySummary(t, industrySnapshot.data, now),
      fetchedAt: industrySnapshot.data?.fetchedAt,
      loading: industrySnapshot.loading,
      deadline:
        nextJobMs !== undefined
          ? { at: nextJobMs, note: t('overview.board.nextJob'), severity: 'watch', to: '/industry' }
          : null,
      render: () => (
        <IndustryCard
          jobs={industryJobs}
          productNames={industrySnapshot.data?.productNames ?? EMPTY_NAMES}
          needsReauth={industrySnapshot.data?.needsReauth ?? false}
          nowMs={now}
        />
      ),
    },
    {
      key: 'structures',
      placement: 'ranked',
      // Offered only to a Character whose corp roles and grant cover it, the
      // rule every corp surface follows (`features/corp/useCorpAccess`). While
      // that is still resolving the card is absent rather than loading: a corp
      // card flickering in and out for a pilot with no roles is worse than one
      // that appears a beat late for a Director.
      available: corpAccess.state === 'ready' && corpAccess.capabilities.canReadStructures,
      to: '/corp',
      severity: structuresSeverity(structures),
      summary: structuresSummary(t, structures),
      fetchedAt: structuresSnapshot.data?.fetchedAt,
      loading: structuresSnapshot.loading,
      deadline: structureClock
        ? {
            at: structureClock.atMs,
            note: t(`overview.board.structureDeadline.${structureClock.kind}`, {
              subject: structureClock.subject,
            }),
            severity: structureClock.severity,
            to: '/corp',
          }
        : null,
      render: () => <StructuresCard data={structures} />,
    },
    {
      key: 'moonChunks',
      placement: 'ranked',
      available: corpAccess.state === 'ready' && corpAccess.capabilities.canReadMoonExtractions,
      to: '/corp',
      severity: moonChunksSeverity(moonSnapshot.data, now),
      summary: moonChunksSummary(t, moonSnapshot.data, now),
      fetchedAt: moonSnapshot.data?.fetchedAt,
      loading: moonSnapshot.loading,
      deadline: nextChunk
        ? {
            at: nextChunk.deadlineMs,
            note: t(
              `overview.board.chunkDeadline.${nextChunk.detail === 'decay' ? 'decay' : 'arrival'}`,
              {
                subject: nextChunk.subject,
              }
            ),
            severity: moonChunkSeverity(nextChunk, now),
            to: '/corp',
          }
        : null,
      render: () => <MoonChunksCard data={moonSnapshot.data} nowMs={now} />,
    },
    {
      key: 'comingUp',
      placement: 'folded',
      to: '/calendar',
      severity: comingUpSeverity(calendarSnapshot.data, now),
      summary: comingUpSummary(t, calendarSnapshot.data, now),
      fetchedAt: calendarSnapshot.data?.fetchedAt,
      loading: calendarSnapshot.loading,
      /*
       * Only events the pilot has actually committed to — `accepted` or
       * `tentative` — so a fleet op nobody has answered yet cannot lead the
       * board (`engine/calendarDeadline`).
       */
      deadline: calendarEvent
        ? {
            at: calendarEvent.atMs,
            note: calendarEvent.title,
            severity: severityForRemaining(calendarEvent.atMs - now),
            to: '/calendar',
          }
        : null,
      render: () => <ComingUpCard data={calendarSnapshot.data} nowMs={now} />,
    },
    {
      key: 'spExtraction',
      placement: 'folded',
      to: '/characters',
      severity: spExtractionSeverity(spExtraction),
      summary: spExtractionSummary(t, spExtraction),
      // Rides on the skills read, which the strip already counts for freshness.
      loading: false,
      render: () => <SpExtractionCard data={spExtraction} />,
    },
    {
      key: 'mail',
      placement: 'folded',
      to: '/mail',
      severity: mailSeverity(mailSnapshot.data),
      summary: mailSummary(t, mailSnapshot.data),
      fetchedAt: mailSnapshot.data?.fetchedAt,
      loading: mailSnapshot.loading,
      render: () => <MailCard data={mailSnapshot.data} nowMs={now} />,
    },
    {
      key: 'priceAlerts',
      placement: 'folded',
      to: '/market',
      severity: priceAlertsSeverity(priceAlertsSnapshot.data),
      summary: priceAlertsSummary(t, priceAlertsSnapshot.data),
      // Prices are the poller's, so the board's own freshness says nothing about them.
      loading: priceAlertsSnapshot.loading,
      render: () => <PriceAlertsCard data={priceAlertsSnapshot.data} nowMs={now} />,
    },
    {
      key: 'alerts',
      placement: 'column',
      to: '/alerts',
      severity: worstSeverity(alertGroups.map((group) => group.severity)),
      summary: alertsSummary(t, visibleAlerts.length, alertGroups.length),
      loading: false,
    },
  ];

  /* The one clock that belongs to no card: skill training lives in the strip itself. */
  const alwaysDeadlines: BoardDeadline[] = [];
  if (trainingFinishMs !== null && trainingFinishMs > now) {
    alwaysDeadlines.push({
      at: trainingFinishMs,
      note: t('overview.board.nextSkill'),
      severity: 'clear',
      to: '/skills/plans',
    });
  }
  const soonest = soonestDeadline(specs, shown, alwaysDeadlines);
  const layout = layoutBoard(specs, { isPhone, shown, phoneFullCount: PHONE_FULL_COUNT });
  const visibleSpecs = specs.filter((spec) => spec.available !== false && shown(spec.key));
  const folded: FoldedDomain[] = layout.folded.map((spec) => ({
    key: spec.key,
    domain: t(OVERVIEW_CARD_LABEL[spec.key]),
    summary: spec.summary,
    severity: spec.severity,
    to: spec.to,
    danger: spec.danger,
  }));
  const nothingShown = visibleSpecs.length === 0;

  const walletBalance = walletSnapshot.data?.result?.data ?? null;

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
                label: formatCountdown(Math.max(0, soonest.at - now) / 1000),
                note: soonest.note,
                severity: soonest.severity,
                to: soonest.to,
              }
        }
        trainingUnavailable={skillsQueueData?.queueNeedsReauth ?? false}
        notTrainingAlertEnabled={notTrainingAlertEnabled}
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
                        duration: formatCountdown(Math.max(0, trainingFinishMs - now) / 1000),
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
        // A hidden card's read is still made, but it is not the board's
        // freshness: a stale Mining read nobody can see must not mark the
        // whole board offline. Refresh below still reloads every card, so one
        // switched back on is not stale either.
        fetchedAt={stalest([
          walletSnapshot.data?.result?.fetchedAt,
          skillsQueueSnapshot.data?.queueResult?.fetchedAt,
          ...visibleSpecs.map((spec) => spec.fetchedAt),
        ])}
        now={now}
        fromCache={Boolean(
          walletSnapshot.data?.result?.fromCache || skillsQueueSnapshot.data?.queueResult?.fromCache
        )}
        onRefresh={() => {
          for (const snapshot of [
            walletSnapshot,
            skillsQueueSnapshot,
            ordersSnapshot,
            miningSnapshot,
            contractsSnapshot,
            planetarySnapshot,
            industrySnapshot,
            calendarSnapshot,
            mailSnapshot,
            priceAlertsSnapshot,
            structuresSnapshot,
            moonSnapshot,
          ]) {
            snapshot.refresh();
          }
        }}
        actions={
          <CardPicker
            cards={specs.filter((spec) => spec.available !== false).map((spec) => spec.key)}
            hidden={hiddenCards}
            onToggle={(key) => void setHiddenCards(toggleHiddenCard(hiddenCards, key))}
            onShowAll={() => void setHiddenCards([])}
          />
        }
        refreshing={walletSnapshot.loading || visibleSpecs.some((spec) => spec.loading)}
      />

      {nothingShown && (
        <p className="rounded-xs border border-line bg-panel/85 px-3 py-4 text-xs text-text-dim">
          {t('overview.board.allCardsHidden')}
        </p>
      )}

      {/*
        Two columns from `xl`: the domain cards, and alerts beside them at full
        height. Below `xl` the sidebar leaves the cards too little width beside
        an alerts column (#1680), so alerts stack under them instead.
        `items-start` is deliberately absent — the grid's default `stretch` is
        what gives the cards in one row a common bottom edge, and a pair at
        different heights reads as one of them having failed to load.
      */}
      <div
        className={`grid min-w-0 gap-4 ${layout.column ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {/* Every card renders unconditionally, mid-load included. Gating one
              on its own data would make "still loading" and "nothing here"
              look identical to "this domain does not exist" — which is the
              failure this board was rebuilt to avoid. Folding a card on a
              phone is not that: the domain still has its line, and says the
              same three things it would have said in full. A card the pilot
              hid from the edit menu is the one exception: they asked for it
              gone. */}
          {layout.full.map(({ key, render }) => (
            <Fragment key={key}>{render?.()}</Fragment>
          ))}
          <EverythingElseCard domains={folded} />
        </div>
        {layout.column && (
          <AlertsColumn
            groups={alertGroups}
            unread={visibleAlerts.length}
            onDismissAll={() => void dismissFeedEntriesAndSync(visibleAlerts)}
          />
        )}
      </div>
    </div>
  );
}
