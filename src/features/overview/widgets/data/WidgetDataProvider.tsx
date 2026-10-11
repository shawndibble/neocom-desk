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
} from '../../boardData';
import { IncursionsBoardSource } from '../../IncursionsBoardSource';
import type { IncursionsBoardData } from '../../incursionsBoard';
import { createFeedStore } from './feedStore';
import { FeedStoreContext, useFeedStore } from './feedStoreContext';
import {
  loadOrdersBoard,
  loadSkillsQueuePanel,
  loadStockBoardFor,
  loadWalletPanel,
} from './loaders';
import { feedsFor } from './models';
import { useOverviewRefresh } from './refreshContext';
import type { FeedId, FeedMap } from './types';

const NO_FEEDS: readonly FeedId[] = [];

type Load<T> = (characterId: number, signal: RouteSnapshotSignal) => Promise<T>;

/** A read made through `useRouteSnapshot`, reloaded whenever the refresh epoch moves. */
function SnapshotSource<K extends FeedId>({
  feed,
  load,
  cacheKey,
}: {
  feed: K;
  load: Load<FeedMap[K]>;
  cacheKey: string;
}) {
  const store = useFeedStore();
  const { epoch } = useOverviewRefresh();
  const snapshot = useRouteSnapshot(load, undefined, { cacheKey });
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
  const monitoringHydrated = useSpExtractionMonitoringEnabled((state) => state.hydrated);
  const hydrateMonitoring = useSpExtractionMonitoringEnabled((state) => state.hydrate);
  const thresholdSp = useSpExtractionThresholdSp((state) => state.value);
  const thresholdHydrated = useSpExtractionThresholdSp((state) => state.hydrated);
  const hydrateThreshold = useSpExtractionThresholdSp((state) => state.hydrate);
  const price = useExtractionPrices();
  useEffect(() => {
    void hydrateMonitoring();
    void hydrateThreshold();
  }, [hydrateMonitoring, hydrateThreshold]);

  const { hubName, loaded, net } = price;
  const hydrated = monitoringHydrated && thresholdHydrated;
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
    case 'incursions':
      return <IncursionsSource />;
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
