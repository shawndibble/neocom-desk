/**
 * Mounts the Overview's reads, once, above the grid.
 *
 * One source per *read*, not per widget and not per kind: Training, Skill
 * points and Open orders' slot count all need the skills read, so it is made
 * once and shared. Only the reads the layout's kinds need are mounted, so a
 * widget the pilot never added never fetches (the `IncursionsBoardSource`
 * pattern, for every feed). Each source reports raw `{data, error, loading}`
 * into the feed store; widgets derive their view from it at render time.
 *
 * The cache keys are the old board's, so a return visit still restores each
 * read on its first frame, and a failed refresh still has the last good value
 * behind it (`useRouteSnapshot` hands back the retained snapshot).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useCorpStockTargetsStore } from '@/features/corp/stockTargets';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { useExtractionPrices } from '@/features/character/useExtractionPrices';
import {
  loadCalendarEventsBoard,
  loadContractsBoard,
  loadIndustryBoard,
  loadMailBoard,
  loadMiningTaxBoard,
  loadMoonChunksBoard,
  loadPlanetaryBoard,
  loadPriceAlertsBoard,
  loadStructuresBoard,
} from '../../data/boardData';
import { IncursionsBoardSource } from '../../IncursionsBoardSource';
import type { IncursionsBoardData } from '../../data/incursionsBoard';
import { createFeedStore } from './feedStore';
import { FeedStoreContext, useFeedStore } from './feedStoreContext';
import {
  loadOrdersBoard,
  loadSkillsQueuePanel,
  loadStockBoardFor,
  loadWalletPanel,
} from './loaders';
import {
  loadClonesWidget,
  loadJournalPanel,
  loadLocationWidget,
  loadLpWidget,
  loadMiningYieldWidget,
  loadNetWorthWidget,
  loadProfitWidget,
  loadHaulingWidget,
  loadBelowMarketWidget,
  loadJumpTimersWidget,
  loadMercenaryDensWidget,
  loadRouteSafetyWidget,
  loadKillsWidget,
  loadOmegaWidget,
  loadTradingProfitWidget,
  loadSurveyWidget,
  loadSovRaidsWidget,
} from './kindLoaders';
import {
  loadCorpAssetsFeed,
  loadCorpCustomsFeed,
  loadCorpJobsFeed,
  loadCorpKillsFeed,
  loadCorpMembersFeed,
  loadCorpRoleAuditFeed,
  loadCorpMiningFeed,
  loadCorpSovereigntyFeed,
  loadCorpStarbasesFeed,
  loadCorpContractsFeed,
  loadCorpSrpFeed,
  loadCorpOrdersFeed,
  loadCorpWalletFeed,
} from './corpFeeds';
import { feedsFor } from './models';
import { useOverviewRefresh } from './refreshContext';
import type { FeedId, FeedMap } from './types';

const NO_FEEDS: readonly FeedId[] = [];

type Load<T> = (characterId: number, signal: RouteSnapshotSignal) => Promise<T>;

/** A stand-in id for a read that does not depend on the header Character. */
const ACCOUNT_WIDE = 0;

/** A read made through `useRouteSnapshot`, reloaded whenever the refresh epoch moves. */
function SnapshotSource<K extends FeedId>({
  feed,
  load,
  cacheKey,
  accountWide = false,
}: {
  feed: K;
  load: Load<FeedMap[K]>;
  cacheKey: string;
  /** The read covers every Character, so switching the header Character must not reload it. */
  accountWide?: boolean;
}) {
  const store = useFeedStore();
  const { epoch } = useOverviewRefresh();
  const snapshot = useRouteSnapshot(load, accountWide ? ACCOUNT_WIDE : undefined, { cacheKey });
  const { refresh } = snapshot;

  // Skip the epoch this source mounted at: a widget added after a refresh must
  // not refetch what its own first load is already fetching.
  const seen = useRef(epoch);
  useEffect(() => {
    if (seen.current === epoch) return;
    seen.current = epoch;
    refresh();
  }, [epoch, refresh]);

  const { data, error, loading } = snapshot;
  const failed = Boolean(error);
  useEffect(() => {
    store.set(feed, { data, error: failed, loading });
  }, [store, feed, data, failed, loading]);
  useEffect(() => () => store.clear(feed), [store, feed]);
  return null;
}

function IncursionsSource() {
  const store = useFeedStore();
  const { epoch } = useOverviewRefresh();
  const [data, setData] = useState<IncursionsBoardData | null>(null);
  useEffect(() => {
    store.set('incursions', {
      data: data?.status === 'ready' ? data : null,
      error: data?.status === 'failed',
      loading: data === null || data.status === 'loading',
    });
  }, [store, data]);
  useEffect(() => () => store.clear('incursions'), [store]);
  return <IncursionsBoardSource refreshKey={epoch} onChange={setData} />;
}

/** The synced SP Extraction settings and the hub price, which are hooks, not loads. */
function SpExtrasSource() {
  const store = useFeedStore();
  const monitoring = useSpExtractionMonitoringEnabled((state) => state.value);
  const thresholdSp = useSpExtractionThresholdSp((state) => state.value);
  const hydrated = useHydratedStore(useSpExtractionMonitoringEnabled, useSpExtractionThresholdSp);
  const price = useExtractionPrices();

  const { hubName, loaded, net } = price;
  const extras = useMemo(
    () => (hydrated ? { monitoring, thresholdSp, price: { hubName, loaded, net } } : null),
    [hydrated, monitoring, thresholdSp, hubName, loaded, net]
  );
  useEffect(() => {
    store.set('spExtras', { data: extras, error: false, loading: extras === null });
  }, [store, extras]);
  useEffect(() => () => store.clear('spExtras'), [store]);
  return null;
}

/** The synced corp stock targets, a hook not a load; hydrated before it answers. */
function CorpStockTargetsSource() {
  const store = useFeedStore();
  const value = useCorpStockTargetsStore((state) => state.value);
  const hydrated = useHydratedStore(useCorpStockTargetsStore);
  useEffect(() => {
    store.set('corpStockTargets', {
      data: hydrated ? value : null,
      error: false,
      loading: !hydrated,
    });
  }, [store, hydrated, value]);
  useEffect(() => () => store.clear('corpStockTargets'), [store]);
  return null;
}

function Source({ feed }: { feed: FeedId }) {
  switch (feed) {
    case 'wallet':
      return <SnapshotSource feed="wallet" load={loadWalletPanel} cacheKey="overview:wallet" />;
    case 'skills':
      return (
        <SnapshotSource feed="skills" load={loadSkillsQueuePanel} cacheKey="overview:skill-queue" />
      );
    case 'orders':
      return <SnapshotSource feed="orders" load={loadOrdersBoard} cacheKey="overview:orders" />;
    case 'mining':
      return (
        <SnapshotSource feed="mining" load={loadMiningTaxBoard} cacheKey="overview:mining-tax" />
      );
    case 'planetary':
      return (
        <SnapshotSource feed="planetary" load={loadPlanetaryBoard} cacheKey="overview:planetary" />
      );
    case 'industry':
      return (
        <SnapshotSource feed="industry" load={loadIndustryBoard} cacheKey="overview:industry" />
      );
    case 'contracts':
      return (
        <SnapshotSource feed="contracts" load={loadContractsBoard} cacheKey="overview:contracts" />
      );
    case 'calendar':
      return (
        <SnapshotSource
          feed="calendar"
          load={loadCalendarEventsBoard}
          cacheKey="overview:calendar"
        />
      );
    case 'mail':
      return <SnapshotSource feed="mail" load={loadMailBoard} cacheKey="overview:mail" />;
    case 'priceAlerts':
      return (
        <SnapshotSource
          feed="priceAlerts"
          load={loadPriceAlertsBoard}
          cacheKey="overview:price-alerts"
        />
      );
    case 'stock':
      return <SnapshotSource feed="stock" load={loadStockBoardFor} cacheKey="overview:stock" />;
    case 'structures':
      return (
        <SnapshotSource
          feed="structures"
          load={loadStructuresBoard}
          cacheKey="overview:structures"
        />
      );
    case 'moonChunks':
      return (
        <SnapshotSource
          feed="moonChunks"
          load={loadMoonChunksBoard}
          cacheKey="overview:moon-chunks"
        />
      );
    case 'hauling':
      return <SnapshotSource feed="hauling" load={loadHaulingWidget} cacheKey="overview:hauling" />;
    case 'survey':
      return <SnapshotSource feed="survey" load={loadSurveyWidget} cacheKey="overview:survey" />;
    case 'belowMarket':
      return (
        <SnapshotSource
          feed="belowMarket"
          load={loadBelowMarketWidget}
          cacheKey="overview:below-market"
        />
      );
    case 'journal':
      return <SnapshotSource feed="journal" load={loadJournalPanel} cacheKey="overview:journal" />;
    case 'netWorth':
      return (
        <SnapshotSource feed="netWorth" load={loadNetWorthWidget} cacheKey="overview:net-worth" />
      );
    case 'profit':
      return <SnapshotSource feed="profit" load={loadProfitWidget} cacheKey="overview:profit" />;
    case 'miningYield':
      return (
        <SnapshotSource
          feed="miningYield"
          load={loadMiningYieldWidget}
          cacheKey="overview:mining-yield"
        />
      );
    case 'lp':
      return <SnapshotSource feed="lp" load={loadLpWidget} cacheKey="overview:lp" />;
    case 'clones':
      return <SnapshotSource feed="clones" load={loadClonesWidget} cacheKey="overview:clones" />;
    case 'jumpTimers':
      return (
        <SnapshotSource
          feed="jumpTimers"
          load={loadJumpTimersWidget}
          cacheKey="overview:jump-timers"
        />
      );
    case 'mercenaryDens':
      return (
        <SnapshotSource
          feed="mercenaryDens"
          load={loadMercenaryDensWidget}
          cacheKey="overview:mercenary-dens"
        />
      );
    case 'location':
      return (
        <SnapshotSource feed="location" load={loadLocationWidget} cacheKey="overview:location" />
      );
    case 'routeSafety':
      return (
        <SnapshotSource
          feed="routeSafety"
          load={loadRouteSafetyWidget}
          cacheKey="overview:route-safety"
        />
      );
    case 'kills':
      return <SnapshotSource feed="kills" load={loadKillsWidget} cacheKey="overview:kills" />;
    case 'omega':
      return (
        <SnapshotSource feed="omega" load={loadOmegaWidget} cacheKey="overview:omega" accountWide />
      );
    case 'tradingProfit':
      return (
        <SnapshotSource
          feed="tradingProfit"
          load={loadTradingProfitWidget}
          cacheKey="overview:trading-profit"
          accountWide
        />
      );
    // The Corp Board's reads: keyed `corp:` so they never share a row with a character read.
    case 'corpWallet':
      return <SnapshotSource feed="corpWallet" load={loadCorpWalletFeed} cacheKey="corp:wallet" />;
    case 'corpJobs':
      return <SnapshotSource feed="corpJobs" load={loadCorpJobsFeed} cacheKey="corp:jobs" />;
    case 'corpCustoms':
      return (
        <SnapshotSource feed="corpCustoms" load={loadCorpCustomsFeed} cacheKey="corp:customs" />
      );
    case 'corpAssets':
      return <SnapshotSource feed="corpAssets" load={loadCorpAssetsFeed} cacheKey="corp:assets" />;
    case 'corpStockTargets':
      return <CorpStockTargetsSource />;
    case 'corpRoleAudit':
      return (
        <SnapshotSource
          feed="corpRoleAudit"
          load={loadCorpRoleAuditFeed}
          cacheKey="corp:roleAudit"
        />
      );
    case 'corpMembers':
      return (
        <SnapshotSource feed="corpMembers" load={loadCorpMembersFeed} cacheKey="corp:members" />
      );
    case 'corpMining':
      return <SnapshotSource feed="corpMining" load={loadCorpMiningFeed} cacheKey="corp:mining" />;
    case 'corpSovereignty':
      return (
        <SnapshotSource
          feed="corpSovereignty"
          load={loadCorpSovereigntyFeed}
          cacheKey="corp:sovereignty"
        />
      );
    case 'corpStarbases':
      return (
        <SnapshotSource
          feed="corpStarbases"
          load={loadCorpStarbasesFeed}
          cacheKey="corp:starbases"
        />
      );
    case 'corpContracts':
      return (
        <SnapshotSource
          feed="corpContracts"
          load={loadCorpContractsFeed}
          cacheKey="corp:contracts"
        />
      );
    case 'corpOrders':
      return <SnapshotSource feed="corpOrders" load={loadCorpOrdersFeed} cacheKey="corp:orders" />;
    case 'corpKills':
      return <SnapshotSource feed="corpKills" load={loadCorpKillsFeed} cacheKey="corp:kills" />;
    case 'corpSrp':
      return <SnapshotSource feed="corpSrp" load={loadCorpSrpFeed} cacheKey="corp:srp" />;
    case 'incursions':
      return <IncursionsSource />;
    case 'sovRaids':
      return (
        <SnapshotSource feed="sovRaids" load={loadSovRaidsWidget} cacheKey="overview:sov-raids" />
      );
    case 'spExtras':
      return <SpExtrasSource />;
  }
}

export function WidgetDataProvider({
  kinds,
  always = NO_FEEDS,
  children,
}: {
  /** The distinct Widget Kinds in the layout; only their reads are mounted. */
  kinds: readonly string[];
  /** Reads the page itself needs whatever the layout holds (the header's SP chips). */
  always?: readonly FeedId[];
  children: ReactNode;
}) {
  const [store] = useState(createFeedStore);
  // Sorted so the same set of kinds never remounts a source by reordering.
  const feeds = useMemo(
    () => [...new Set([...feedsFor(kinds), ...always])].sort(),
    [kinds, always]
  );
  return (
    <FeedStoreContext.Provider value={store}>
      {feeds.map((feed) => (
        <Source key={feed} feed={feed} />
      ))}
      {children}
    </FeedStoreContext.Provider>
  );
}
