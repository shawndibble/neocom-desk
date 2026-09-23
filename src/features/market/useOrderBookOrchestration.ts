/**
 * The Market Browser's Order Book: the selected item's live sell/buy rows at
 * the current Location Mode (ADR 0003), the region-set fan-out for All
 * Regions, the filter bar (Jump Range/Security/Min quantity/NPC stations
 * only), the order-row "filter to this station" narrowing, the row-cap
 * "show all" toggles, and the Variations table's own per-row prices — all
 * read through the same `orderBookView.ts` so the tables, the Variations
 * rows, the Compare Drawer and Item Detail can't disagree about one item.
 *
 * Held at route level, not inside a Browser panel, for the same reason
 * `useAppraisal` is: `CompareDrawer` and `ItemDetailModal` render outside the
 * Browser tab's own branch and read `orderBookLocation`/`refreshTick` from
 * here regardless of which tab is showing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUrlParam, useUrlParams } from '@/lib/useUrlState';
import { boolParam, enumParam, enumSetParam, intParam, type UrlParamCodec } from '@/lib/urlState';
import { JUMP_RANGES, DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { intersectSystemSets, systemsInSpace } from '@/engine/market/orderBookFilters';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type CurrentSystemState,
  type JumpRangeFilter,
} from '@/features/route/currentSystem';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';
import {
  buildOrderBookView,
  clearOrderBookViewCache,
  clearOrderBookViewCacheAcross,
  fetchOrderBook,
  fetchOrderBookAcross,
  loadOrderBookView,
  orderBookLocationFor,
  useGlobalMarketOverrides,
  type OrderBookFetch,
  type OrderBookLocation,
  type OrderBookView,
  type LoadedOrderBookView,
} from '@/features/market/orderBookView';
import type { RegionOrder } from '@/esi/endpoints';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import {
  regionsForSystems,
  resolveOrderBookRegion,
  type GlobalMarketOverride,
  type ResolvedOrderBookRegion,
} from '@/engine/market/locationMode';
import { getVariationRows, type VariationsResult } from '@/features/market/variations';
import { resolveOrderLocation, type OrderBookSummary } from '@/engine/market/orderBook';
import type { VariationIndex } from '@/engine/market/variations';
import type { TradeHub } from '@/market/hubs';
import type { MarketLocationParam } from '@/engine/market/urlState';
import type {
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
} from '@/sde/marketTypes';

/** Stand-in until globalMarkets.json settles; the order book waits for the real one. */
const NO_GLOBAL_MARKETS: ReadonlyMap<number, GlobalMarketOverride> = new Map();

const REGIONS_UNAVAILABLE_FETCH: OrderBookFetch = {
  status: 'failed',
  error: new Error('Market Region catalogue unavailable'),
};

/** `stationFilter` (:591 originally), URL-backed: a positive location id, or `null`. */
const STATION_FILTER_PARAM: UrlParamCodec<number | null> = {
  parse: (raw) => (raw !== null && /^\d+$/.test(raw) ? Number(raw) : null),
  serialize: (value) => (value === null ? null : String(value)),
};

/**
 * The order book's filter bar — Jump Range, Security, Min quantity, NPC
 * stations only — as one `useUrlParams` group, so the narrow sheet's Apply
 * lands every changed field in one write rather than four writers racing in
 * one tick (see `navigateTo` in `useMarketBrowser.ts`).
 */
const BROWSER_FILTER_PARAMS = {
  'browser.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'browser.sec': enumSetParam(SPACE_KINDS),
  'browser.minQty': intParam(0, { min: 0 }),
  'browser.npcOnly': boolParam(),
};

export interface BrowserFilterValue {
  jumps: JumpRange;
  sec: ReadonlySet<SpaceKind>;
  minQty: number;
  npcOnly: boolean;
}

export interface UseOrderBookOrchestrationArgs {
  selectedTypeId: number | null;
  selectedItem: MarketTypeEntry | null;
  effectiveLocation: MarketLocationParam;
  effectiveHub: TradeHub;
  allRegions: boolean;
  chosenRegionId: number;
  hubHydrated: boolean;
  locationModeHydrated: boolean;
  catalogueError: boolean;
  ensureBlueprintCatalog: () => void;
  npcStations: NpcStationEntry[] | null;
  solarSystems: SolarSystemEntry[] | null;
  marketRegions: MarketRegionEntry[] | null;
  allMarketRegionIds: number[];
  systemRegions: ReadonlyMap<number, { regionId: number }>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  typesById: ReadonlyMap<number, MarketTypeEntry>;
  variationIndex: VariationIndex;
  npcStationMap: ReadonlyMap<number, { name: string; systemId: number }>;
  solarSystemMap: ReadonlyMap<number, { name: string; security: number }>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export interface OrderBookOrchestration {
  orderBookLoading: boolean;
  refreshTick: number;
  myOrderIds: ReadonlySet<number>;
  orderBookLocation: OrderBookLocation;
  resolvedRegion: ResolvedOrderBookRegion | null;
  hubRegionName: string;

  currentSystem: CurrentSystemState;
  jumpRangeFilter: JumpRangeFilter;
  regionMode: boolean;

  stationFilter: number | null;
  setStationFilter: (next: number | null) => void;
  stationFilterLabel: string | null;

  browserFilterValue: BrowserFilterValue;
  handleBrowserFiltersChange: (next: BrowserFilterValue) => void;
  activeFilterCount: number;
  filtersNarrowBook: boolean;

  orderBookFailed: boolean;
  regionsUnavailable: boolean;
  orderBookView: OrderBookView | null;
  loadedView: LoadedOrderBookView | null;
  sortedSell: readonly RegionOrder[];
  sortedBuy: readonly RegionOrder[];
  sellShowAll: boolean;
  setSellShowAll: (next: boolean) => void;
  buyShowAll: boolean;
  setBuyShowAll: (next: boolean) => void;

  failedRegionCount: number;
  jumpNoteShown: boolean;

  variationsResult: VariationsResult | null;
  variationPrices: ReadonlyMap<number, OrderBookSummary | undefined>;

  /** Bypasses every TTL cache for what's on screen, then bumps `refreshTick` (CONTEXT.md "Data Age"). */
  refresh: () => void;
}

export function useOrderBookOrchestration({
  selectedTypeId,
  selectedItem,
  effectiveLocation,
  effectiveHub,
  allRegions,
  chosenRegionId,
  hubHydrated,
  locationModeHydrated,
  catalogueError,
  ensureBlueprintCatalog,
  npcStations,
  solarSystems,
  marketRegions,
  allMarketRegionIds,
  systemRegions,
  typesByGroup,
  typesById,
  variationIndex,
  npcStationMap,
  solarSystemMap,
  t,
}: UseOrderBookOrchestrationArgs): OrderBookOrchestration {
  // Loaded independently, not with the SDE catalogue: the order book waits
  // only on this (never on the whole SDE catalogue), and a failed read
  // settles to no overrides rather than leaving the book waiting forever.
  const globalMarkets = useGlobalMarketOverrides();
  const globalMarketsMap = globalMarkets ?? NO_GLOBAL_MARKETS;

  // The selected item's settled fetch, null until it lands. The view itself is
  // derived below, so the "filter to this station" action narrows it in place
  // without another request.
  const [orderBookFetch, setOrderBookFetch] = useState<OrderBookFetch | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Every authenticated character's own open order ids, across every item —
  // not scoped to the selected type, since matching is by order_id against
  // whatever's on screen. Membership is the whole question here: a row that
  // is mine gets a tinted background, and nothing else. How badly a rival
  // beats it is the Open Orders page's job, which has the cost basis and the
  // exits to say something useful about it.
  const [myOrderIds, setMyOrderIds] = useState<ReadonlySet<number>>(new Set());
  const [sellShowAll, setSellShowAll] = useState(false);
  const [buyShowAll, setBuyShowAll] = useState(false);
  // The order row context menu's "filter to this station" action (CONTEXT.md
  // round 10); undone via the banner rendered above the tables. URL-backed
  // (ADR 0015), scoped to the Browser tab.
  const [stationFilter, setStationFilter] = useUrlParam('browser.station', STATION_FILTER_PARAM);
  // The order book's filter bar. Jump Range, Security and NPC stations only
  // are Region mode only — Hub mode is already one NPC station — so they're
  // neither shown nor applied there, whatever the URL says; Min quantity
  // applies in both. All narrow the book next to the station filter, see
  // `orderBookView.ts`'s `allowedSystems`/`minQuantity`/`npcStationIds`.
  const [browserFilters, setBrowserFilters] = useUrlParams(BROWSER_FILTER_PARAMS);
  const regionMode = effectiveLocation.mode === 'region';
  const jumpRange = browserFilters['browser.jumps'];
  const spaceKinds = browserFilters['browser.sec'];
  const minQuantity = browserFilters['browser.minQty'];
  const npcOnly = regionMode && browserFilters['browser.npcOnly'];
  const currentSystem = useCurrentSystem();
  const jumpRangeFilter = useJumpRangeFilter(
    currentSystem,
    regionMode ? jumpRange : DEFAULT_JUMP_RANGE
  );

  // `allRegions` apart from `chosenRegionId`: The Forge → All regions with
  // Jita as hub is the same region id, yet a different book.
  const resetKey = `${selectedTypeId ?? 'none'}:${chosenRegionId}:${allRegions ? 'all' : 'one'}`;
  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (resetKey !== resetForKey) {
    setResetForKey(resetKey);
    setSellShowAll(false);
    setBuyShowAll(false);
    setOrderBookFetch(null);
    // `browser.station` clears in `navigateTo` itself, not here — every path
    // that changes `resetKey` goes through it, and clearing it here too was a
    // second, independent `useUrlParams` writer landing in the same render as
    // `navigateTo`'s own write, which silently dropped one of the two.
    // Set in the same render as the reset above, not left for the fetch
    // effect a tick later — otherwise the one commit in between paints
    // `orderBookLoading: false` alongside the just-cleared `orderBookFetch`,
    // which the table below reads as "loaded, and empty" and flashes the
    // empty state before the spinner.
    if (selectedTypeId !== null) setOrderBookLoading(true);
  }

  // Independent of the catalogue and order-book loads: a character with no
  // orders scope, or with no characters signed in at all, simply resolves to
  // an empty set — the highlight below then degrades to "nothing here is
  // mine" rather than erroring. Refetches on a manual Refresh (refreshTick)
  // the same way the order book itself does, so placing or cancelling an
  // order and hitting Refresh updates the highlight in place.
  useEffect(() => {
    let cancelled = false;
    void loadAllCharactersOpenOrders()
      .then((snapshot) => {
        if (cancelled) return;
        const ids = new Set<number>();
        for (const entry of snapshot.entries) {
          for (const order of entry.orders) ids.add(order.order_id);
        }
        setMyOrderIds(ids);
      })
      .catch(() => {
        // Leaves myOrderIds at whatever it was — a failed fetch must not
        // erase an already-known highlight.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // The one location every order book on this page reads through — the
  // tables, the Variations rows, the Compare Drawer and Item Detail — so they
  // can't disagree about the same item (`orderBookView.ts`). Built from the
  // effective (URL-aware) location, not the persisted preference.
  const orderBookLocation = useMemo<OrderBookLocation>(
    () =>
      orderBookLocationFor(effectiveLocation.mode, chosenRegionId, effectiveHub, globalMarketsMap),
    [effectiveLocation.mode, chosenRegionId, effectiveHub, globalMarketsMap]
  );

  const resolvedRegion = useMemo(
    () =>
      selectedTypeId === null
        ? null
        : resolveOrderBookRegion(selectedTypeId, chosenRegionId, globalMarketsMap),
    [selectedTypeId, chosenRegionId, globalMarketsMap]
  );

  const hubRegionName =
    marketRegions?.find((r) => r.id === effectiveHub.regionId)?.name ?? effectiveHub.systemName;

  // All regions' fan-out: every Market Region the picker lists, or — once a
  // Jump Range is measurable — only those holding an in-range system, so
  // "within 5 jumps" costs a few regions, not every one. Waits (null) while
  // the range is still resolving rather than firing every region and then a
  // few. Keyed by a joined string so an unchanged set never refetches.
  const allRegionsFetchKey = useMemo((): string | null => {
    if (!allRegions || marketRegions === null || jumpRangeFilter.status === 'loading') return null;
    if (jumpRangeFilter.status === 'ready' && jumpRangeFilter.allowed !== null) {
      const inReach = regionsForSystems(jumpRangeFilter.allowed, systemRegions);
      return allMarketRegionIds.filter((id) => inReach.has(id)).join(',');
    }
    return allMarketRegionIds.join(',');
  }, [allRegions, marketRegions, jumpRangeFilter, systemRegions, allMarketRegionIds]);
  const allRegionsFetchIds = useMemo(
    () =>
      allRegionsFetchKey === null
        ? null
        : allRegionsFetchKey === ''
          ? []
          : allRegionsFetchKey.split(',').map(Number),
    [allRegionsFetchKey]
  );

  // Refetches on selection, location, or a manual Refresh click. Gated on both
  // *Hydrated flags so this doesn't fire once for the defaults and again once
  // the persisted settings resolve. `fetchOrderBook` never rejects: a 420 or
  // an Error Budget refusal settles as `'failed'`, which renders its own
  // state rather than an empty book or a spinner that never clears.
  useEffect(() => {
    // Also waits for globalMarkets.json to settle (success or failure):
    // before it does, a Global Market Region item (a PLEX deep link) would be
    // read from the wrong region.
    if (selectedTypeId === null || !hubHydrated || !locationModeHydrated || globalMarkets === null)
      return;
    // Waits for the region list and the range (see `allRegionsFetchKey`).
    if (allRegions && allRegionsFetchIds === null) return;
    let cancelled = false;
    void (async () => {
      setOrderBookLoading(true);
      const fetched =
        allRegionsFetchIds !== null
          ? await fetchOrderBookAcross(
              selectedTypeId,
              allRegionsFetchIds,
              orderBookLocation,
              () => cancelled
            )
          : await fetchOrderBook(selectedTypeId, orderBookLocation);
      if (cancelled) return;
      setOrderBookFetch(fetched);
      setOrderBookLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedTypeId,
    orderBookLocation,
    allRegions,
    allRegionsFetchIds,
    hubHydrated,
    locationModeHydrated,
    globalMarkets,
    refreshTick,
  ]);

  // Location Mode, Trade Hub station, the order-row "filter to this station"
  // action (CONTEXT.md round 10), the filter bar, split and sort all happen
  // in the view.
  // All regions with no region catalogue has no "every region" to read: a
  // failed book (with its retry), not a spinner waiting on a list that
  // isn't coming.
  const regionsUnavailable = allRegions && catalogueError;
  const settledFetch = regionsUnavailable ? REGIONS_UNAVAILABLE_FETCH : orderBookFetch;
  const spaceSystems = useMemo(
    () => (regionMode && solarSystems ? systemsInSpace(solarSystems, spaceKinds) : null),
    [regionMode, solarSystems, spaceKinds]
  );
  const allowedSystems = useMemo(
    () =>
      regionMode
        ? intersectSystemSets(
            jumpRangeFilter.status === 'ready' ? jumpRangeFilter.allowed : null,
            spaceSystems
          )
        : null,
    [regionMode, jumpRangeFilter, spaceSystems]
  );
  // Not applied until the station list has loaded — before then every order
  // would read as a player structure and the book would flash empty.
  const npcStationIds = useMemo(
    () => (npcOnly && npcStations ? new Set(npcStations.map((s) => s.id)) : null),
    [npcOnly, npcStations]
  );
  const orderBookView = useMemo(
    () =>
      settledFetch === null || selectedTypeId === null
        ? null
        : buildOrderBookView(
            selectedTypeId,
            { ...orderBookLocation, stationFilter, allowedSystems, minQuantity, npcStationIds },
            settledFetch
          ),
    [
      settledFetch,
      selectedTypeId,
      orderBookLocation,
      stationFilter,
      allowedSystems,
      minQuantity,
      npcStationIds,
    ]
  );
  const loadedView = orderBookView?.status === 'failed' ? null : orderBookView;
  const orderBookFailed = orderBookView?.status === 'failed';
  const sortedSell = useMemo(() => loadedView?.sell ?? [], [loadedView]);
  const sortedBuy = useMemo(() => loadedView?.buy ?? [], [loadedView]);
  /**
   * The catalogue is otherwise loaded lazily on the first context-menu open,
   * so reading it here without asking for it meant `selectedIsBlueprint` was
   * always false on a fresh page and the hint below never appeared at all.
   * Requested only once the book is actually empty, which keeps the laziness
   * this was built for: the payload is fetched in the one case its answer can
   * change what is rendered, not on every item you click.
   */
  useEffect(() => {
    // `ensureBlueprintCatalog` is ref-guarded, so re-running this costs nothing.
    // A failed book says nothing about who sells the item, so it asks nothing.
    if (selectedTypeId !== null && loadedView && sortedSell.length === 0) ensureBlueprintCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ensureBlueprintCatalog` is a stable, ref-guarded no-op past its first call; listing it would fire this on every render even though its identity changes.
  }, [selectedTypeId, loadedView, sortedSell.length]);

  const stationFilterLabel = useMemo(() => {
    if (stationFilter === null || orderBookFetch?.status !== 'fetched') return null;
    const order = orderBookFetch.result.orders.find((o) => o.location_id === stationFilter);
    if (!order) return null;
    const location = resolveOrderLocation(order, npcStationMap, solarSystemMap);
    // Names the same station the Location column does, so the banner and the
    // rows below it read alike.
    return location.stationName ?? t('market.unknownStructure');
  }, [stationFilter, orderBookFetch, npcStationMap, solarSystemMap, t]);

  const browserFilterValue = useMemo<BrowserFilterValue>(
    () => ({
      jumps: jumpRange,
      sec: spaceKinds,
      minQty: minQuantity,
      npcOnly: browserFilters['browser.npcOnly'],
    }),
    [jumpRange, spaceKinds, minQuantity, browserFilters]
  );
  // Only what this mode shows counts: a Region-only filter left in the URL
  // does nothing in Hub mode, so badging it would claim a filter that isn't on.
  const activeFilterCount = [
    regionMode && jumpRange !== DEFAULT_JUMP_RANGE,
    regionMode && spaceKinds.size !== SPACE_KINDS.length,
    minQuantity > 0,
    npcOnly,
  ].filter(Boolean).length;
  const filtersNarrowBook = activeFilterCount > 0 || stationFilter !== null;
  function handleBrowserFiltersChange(next: BrowserFilterValue) {
    setBrowserFilters({
      'browser.jumps': next.jumps,
      'browser.sec': next.sec,
      'browser.minQty': next.minQty,
      'browser.npcOnly': next.npcOnly,
    });
  }

  const failedRegionCount = loadedView?.failedRegionIds.length ?? 0;
  // Only "can't measure" earns a line: a range that applies needs no caption.
  const jumpNoteShown =
    regionMode && (jumpRangeFilter.status === 'no-origin' || jumpRangeFilter.status === 'unknown');

  // Variations (CONTEXT.md round 6): the selected item's Tech/Meta/Faction
  // variation group, falling back to Market Group siblings, re-anchored
  // whenever selectedItem changes — including a click on a row itself, which
  // just becomes the new selectedItem.
  const variationsResult = useMemo(
    () =>
      selectedItem ? getVariationRows(variationIndex, typesByGroup, typesById, selectedItem) : null,
    [variationIndex, typesByGroup, typesById, selectedItem]
  );
  // Latest-ref pattern (useCompareRows.ts): handleRefresh reads this value
  // only on click, well after it settles — a ref sidesteps the ordering
  // entirely instead of asking the render function to read ahead.
  const variationsResultRef = useRef(variationsResult);
  useEffect(() => {
    variationsResultRef.current = variationsResult;
  });

  const [variationPrices, setVariationPrices] = useState<
    ReadonlyMap<number, OrderBookSummary | undefined>
  >(new Map());
  // Same "adjusting state when a prop changes" pattern as resetKey above:
  // clears stale row prices the instant the row set or the location changes,
  // in the same render — an Effect would let the old item's prices flash
  // under the new table. stationFilter is included so the table stays in
  // step with the order-row "filter to this station" action (CONTEXT.md
  // round 10) the same way the on-screen tables do; refreshTick deliberately
  // isn't, so a manual refresh updates prices in place instead of blanking
  // the table back to a loading state.
  const variationResetKey = variationsResult
    ? `${variationsResult.rows.map((row) => row.typeId).join(',')}:${chosenRegionId}:${orderBookLocation.mode}:${orderBookLocation.hubStationId}:${stationFilter ?? 'none'}`
    : 'none';
  const [variationResetForKey, setVariationResetForKey] = useState<string | null>(null);
  if (variationResetKey !== variationResetForKey) {
    setVariationResetForKey(variationResetKey);
    setVariationPrices(new Map());
  }

  // Fetched independently of the main order book, so a slow row's price
  // never delays the order book's own render (acceptance criteria). Also
  // reruns on refreshTick so a manual Refresh — which clears getOrderBook's
  // cache — refetches row prices too, not just the on-screen tables.
  useEffect(() => {
    if (
      !variationsResult ||
      variationsResult.rows.length === 0 ||
      !hubHydrated ||
      !locationModeHydrated ||
      globalMarkets === null
    ) {
      return;
    }
    let cancelled = false;
    // Capped, not one Promise.all: ~20 rows fired at once tripped Sentry's
    // N+1 API Call detector (ORDER_BOOK_FANOUT_CONCURRENCY).
    void mapWithConcurrencyLimit(
      variationsResult.rows,
      ORDER_BOOK_FANOUT_CONCURRENCY,
      async (row) => {
        if (cancelled) return;
        const view = await loadOrderBookView(row.typeId, { ...orderBookLocation, stationFilter });
        if (cancelled) return;
        // A row's own price is a nice-to-have next to the order book that did
        // load; a failed fetch reads as "no orders" (the empty summary) rather
        // than stalling the table on a spinner forever.
        const summary: OrderBookSummary =
          view.status === 'failed'
            ? { bestSell: null, bestBuy: null, spread: null, availableVolume: 0 }
            : view.summary;
        setVariationPrices((prev) => new Map(prev).set(row.typeId, summary));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    variationsResult,
    orderBookLocation,
    stationFilter,
    hubHydrated,
    locationModeHydrated,
    globalMarkets,
    refreshTick,
  ]);

  // Manual refresh must bypass getOrderBook's 300s TTL cache (CONTEXT.md
  // "Data Age": refresh happens on app open + manual button only) — scoped
  // to what's actually on screen (the selected item, plus the Variations
  // table rows beneath it, which reuse this same tick to refetch their own
  // prices in place), not a global wipe. That's the difference from the
  // Compare Drawer: its rows aren't part of this page's own render, so they
  // keep whatever's still within TTL instead of being forced to refetch just
  // because something else on the page was refreshed. Also the failed order
  // book's "Try again".
  function refresh() {
    // All regions clears the type in every region, not just the ones last
    // fetched: a range change since would otherwise leave some stale.
    if (selectedTypeId !== null) {
      if (allRegions) {
        clearOrderBookViewCacheAcross(selectedTypeId, allMarketRegionIds, orderBookLocation);
      } else {
        clearOrderBookViewCache(selectedTypeId, orderBookLocation);
      }
    }
    for (const row of variationsResultRef.current?.rows ?? []) {
      clearOrderBookViewCache(row.typeId, orderBookLocation);
    }
    setRefreshTick((n) => n + 1);
  }

  return {
    orderBookLoading,
    refreshTick,
    myOrderIds,
    orderBookLocation,
    resolvedRegion,
    hubRegionName,
    currentSystem,
    jumpRangeFilter,
    regionMode,
    stationFilter,
    setStationFilter,
    stationFilterLabel,
    browserFilterValue,
    handleBrowserFiltersChange,
    activeFilterCount,
    filtersNarrowBook,
    orderBookFailed,
    regionsUnavailable,
    orderBookView,
    loadedView,
    sortedSell,
    sortedBuy,
    sellShowAll,
    setSellShowAll,
    buyShowAll,
    setBuyShowAll,
    failedRegionCount,
    jumpNoteShown,
    variationsResult,
    variationPrices,
    refresh,
  };
}
