/**
 * How each feed is read, declared once per `FeedId`.
 *
 * `FEED_SOURCES` is typed over every `FeedId`, so a feed added to `FeedMap`
 * without a source fails the typecheck, and a feed no kind reads fails
 * `kindRegistry.test.ts`. The provider mounts one source per feed the layout's
 * kinds read; nothing else decides how a feed is fetched.
 *
 * Two kinds of source: a `snapshot` (an async load through `useRouteSnapshot`,
 * reloaded when the refresh epoch moves) and a `hook` (a component that reads
 * synced stores or a board hook and reports through `useReportFeed`).
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpStockTargetsStore } from '@/features/corp/stockTargets';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
  useSpFarmCharacters,
  isSpFarmCharacter,
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
import { useFeedStore } from './feedStoreContext';
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
import { MarketTrendSource } from './marketTrendSource';
import { useOverviewRefresh } from './refreshContext';
import type { FeedId, FeedMap } from './types';

type Load<T> = (characterId: number, signal: RouteSnapshotSignal) => Promise<T>;

export type FeedSource<K extends FeedId = FeedId> =
  | {
      type: 'snapshot';
      load: Load<FeedMap[K]>;
      /** The persisted snapshot's key; a return visit restores the read on its first frame. */
      cacheKey: string;
      /** The read covers every Character, so switching the header Character must not reload it. */
      accountWide: boolean;
    }
  | { type: 'hook'; Component: ComponentType };

function snapshot<K extends FeedId>(
  load: Load<FeedMap[K]>,
  cacheKey: string,
  { accountWide = false }: { accountWide?: boolean } = {}
): FeedSource<K> {
  return { type: 'snapshot', load, cacheKey, accountWide };
}

/** A stand-in id for a read that does not depend on the header Character. */
const ACCOUNT_WIDE = 0;

/**
 * Reports a source's state into the feed store and clears it on unmount: the
 * effect pair every source needs, in one place.
 */
function useReportFeed<K extends FeedId>(
  feed: K,
  data: FeedMap[K] | null,
  error: boolean,
  loading: boolean
) {
  const store = useFeedStore();
  useEffect(() => {
    store.set(feed, { data, error, loading });
  }, [store, feed, data, error, loading]);
  useEffect(() => () => store.clear(feed), [store, feed]);
}

/** A read made through `useRouteSnapshot`, reloaded whenever the refresh epoch moves. */
function SnapshotSource<K extends FeedId>({
  feed,
  source,
}: {
  feed: K;
  source: Extract<FeedSource<K>, { type: 'snapshot' }>;
}) {
  const { epoch } = useOverviewRefresh();
  const snapshotState = useRouteSnapshot(
    source.load,
    source.accountWide ? ACCOUNT_WIDE : undefined,
    { cacheKey: source.cacheKey }
  );
  const { refresh } = snapshotState;

  // Skip the epoch this source mounted at: a widget added after a refresh must
  // not refetch what its own first load is already fetching.
  const seen = useRef(epoch);
  useEffect(() => {
    if (seen.current === epoch) return;
    seen.current = epoch;
    refresh();
  }, [epoch, refresh]);

  useReportFeed(feed, snapshotState.data, Boolean(snapshotState.error), snapshotState.loading);
  return null;
}

function IncursionsSource() {
  const { epoch } = useOverviewRefresh();
  const [data, setData] = useState<IncursionsBoardData | null>(null);
  useReportFeed(
    'incursions',
    data?.status === 'ready' ? data : null,
    data?.status === 'failed',
    data === null || data.status === 'loading'
  );
  return <IncursionsBoardSource refreshKey={epoch} onChange={setData} />;
}

/** The synced SP Extraction settings and the hub price, which are hooks, not loads. */
function SpExtrasSource() {
  const enabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const farm = useSpFarmCharacters((state) => state.value);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  // Only a character marked SP Farm is ever flagged ready (#5658).
  const monitoring =
    enabled && activeCharacterId !== null && isSpFarmCharacter(farm, activeCharacterId);
  const thresholdSp = useSpExtractionThresholdSp((state) => state.value);
  const hydrated = useHydratedStore(
    useSpExtractionMonitoringEnabled,
    useSpExtractionThresholdSp,
    useSpFarmCharacters
  );
  const price = useExtractionPrices();

  const { hubName, loaded, net } = price;
  const extras = useMemo(
    () => (hydrated ? { monitoring, thresholdSp, price: { hubName, loaded, net } } : null),
    [hydrated, monitoring, thresholdSp, hubName, loaded, net]
  );
  useReportFeed('spExtras', extras, false, extras === null);
  return null;
}

/** The synced corp stock targets, a hook not a load; hydrated before it answers. */
function CorpStockTargetsSource() {
  const value = useCorpStockTargetsStore((state) => state.value);
  const hydrated = useHydratedStore(useCorpStockTargetsStore);
  useReportFeed('corpStockTargets', hydrated ? value : null, false, !hydrated);
  return null;
}

// The table is the contract the tests read; the sources it names are components, hence the lint note.
// eslint-disable-next-line react-refresh/only-export-components
export const FEED_SOURCES: { readonly [K in FeedId]: FeedSource<K> } = {
  wallet: snapshot(loadWalletPanel, 'overview:wallet'),
  skills: snapshot(loadSkillsQueuePanel, 'overview:skill-queue'),
  orders: snapshot(loadOrdersBoard, 'overview:orders'),
  mining: snapshot(loadMiningTaxBoard, 'overview:mining-tax'),
  planetary: snapshot(loadPlanetaryBoard, 'overview:planetary'),
  industry: snapshot(loadIndustryBoard, 'overview:industry'),
  contracts: snapshot(loadContractsBoard, 'overview:contracts'),
  calendar: snapshot(loadCalendarEventsBoard, 'overview:calendar'),
  mail: snapshot(loadMailBoard, 'overview:mail'),
  priceAlerts: snapshot(loadPriceAlertsBoard, 'overview:price-alerts'),
  stock: snapshot(loadStockBoardFor, 'overview:stock'),
  structures: snapshot(loadStructuresBoard, 'overview:structures'),
  moonChunks: snapshot(loadMoonChunksBoard, 'overview:moon-chunks'),
  incursions: { type: 'hook', Component: IncursionsSource },
  sovRaids: snapshot(loadSovRaidsWidget, 'overview:sov-raids'),
  spExtras: { type: 'hook', Component: SpExtrasSource },
  journal: snapshot(loadJournalPanel, 'overview:journal'),
  netWorth: snapshot(loadNetWorthWidget, 'overview:net-worth'),
  profit: snapshot(loadProfitWidget, 'overview:profit'),
  miningYield: snapshot(loadMiningYieldWidget, 'overview:mining-yield'),
  lp: snapshot(loadLpWidget, 'overview:lp'),
  survey: snapshot(loadSurveyWidget, 'overview:survey'),
  hauling: snapshot(loadHaulingWidget, 'overview:hauling'),
  belowMarket: snapshot(loadBelowMarketWidget, 'overview:below-market'),
  clones: snapshot(loadClonesWidget, 'overview:clones'),
  jumpTimers: snapshot(loadJumpTimersWidget, 'overview:jump-timers'),
  mercenaryDens: snapshot(loadMercenaryDensWidget, 'overview:mercenary-dens'),
  location: snapshot(loadLocationWidget, 'overview:location'),
  routeSafety: snapshot(loadRouteSafetyWidget, 'overview:route-safety'),
  kills: snapshot(loadKillsWidget, 'overview:kills'),
  marketTrend: { type: 'hook', Component: MarketTrendSource },
  omega: snapshot(loadOmegaWidget, 'overview:omega', { accountWide: true }),
  tradingProfit: snapshot(loadTradingProfitWidget, 'overview:trading-profit', {
    accountWide: true,
  }),
  // The Corp Board's reads: keyed `corp:` so they never share a row with a character read.
  corpWallet: snapshot(loadCorpWalletFeed, 'corp:wallet'),
  corpJobs: snapshot(loadCorpJobsFeed, 'corp:jobs'),
  corpCustoms: snapshot(loadCorpCustomsFeed, 'corp:customs'),
  corpAssets: snapshot(loadCorpAssetsFeed, 'corp:assets'),
  corpStockTargets: { type: 'hook', Component: CorpStockTargetsSource },
  corpRoleAudit: snapshot(loadCorpRoleAuditFeed, 'corp:roleAudit'),
  corpMembers: snapshot(loadCorpMembersFeed, 'corp:members'),
  corpMining: snapshot(loadCorpMiningFeed, 'corp:mining'),
  corpStarbases: snapshot(loadCorpStarbasesFeed, 'corp:starbases'),
  corpSovereignty: snapshot(loadCorpSovereigntyFeed, 'corp:sovereignty'),
  corpContracts: snapshot(loadCorpContractsFeed, 'corp:contracts'),
  corpOrders: snapshot(loadCorpOrdersFeed, 'corp:orders'),
  corpKills: snapshot(loadCorpKillsFeed, 'corp:kills'),
  corpSrp: snapshot(loadCorpSrpFeed, 'corp:srp'),
};

/** Mounts the one source that reads `feed`. */
export function FeedSourceMount({ feed }: { feed: FeedId }) {
  const source = FEED_SOURCES[feed] as FeedSource;
  if (source.type === 'hook') return <source.Component />;
  return <SnapshotSource feed={feed} source={source} />;
}
