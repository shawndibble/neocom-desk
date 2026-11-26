import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlParam } from '@/lib/useUrlState';
import type { UrlParamCodec } from '@/lib/urlState';
import { intersectSystemSets, systemsInSpace } from '@/engine/market/orderBookFilters';
import type { CurrentSystemState, JumpRangeFilter } from '@/features/route/currentSystem';
import type { ActiveFilter } from '@/components/ui';
import { useBrowserFilters, type BrowserFilterValue } from '@/features/market/useBrowserFilters';
import { useOrderBookFetch } from '@/features/market/useOrderBookFetch';
import { useVariations } from '@/features/market/useVariations';
import { useBookStationMap } from '@/features/market/useBookStationMap';
import {
  buildOrderBookView,
  clearOrderBookViewCache,
  clearOrderBookViewCacheAcross,
  orderBookLocationFor,
  useGlobalMarketOverrides,
  type OrderBookFetch,
  type OrderBookLocation,
  type OrderBookView,
  type LoadedOrderBookView,
} from '@/features/market/orderBookView';
import type { RegionOrder } from '@/esi/endpoints';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import { ownOrderIdSet } from '@/features/market/openOrdersModel';
import {
  resolveOrderBookRegion,
  type GlobalMarketOverride,
  type ResolvedOrderBookRegion,
} from '@/engine/market/locationMode';
import type { VariationsResult } from '@/features/market/variations';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type OrderBookSummary,
} from '@/engine/market/orderBook';
import {
  bookDepth,
  sortBookSide,
  withoutBaitSells,
  type DepthAt,
} from '@/engine/market/orderBookDepth';
import type { MarketCatalogue } from '@/features/market/useMarketCatalogue';
import type { TradeHub } from '@/market/hubs';
import type { MarketLocationParam } from '@/engine/market/urlState';
import type { MarketTypeEntry } from '@/sde/marketTypes';

export type { BrowserFilterValue };

const NO_GLOBAL_MARKETS: ReadonlyMap<number, GlobalMarketOverride> = new Map();

const REGIONS_UNAVAILABLE_FETCH: OrderBookFetch = {
  status: 'failed',
  error: new Error('Market Region catalogue unavailable'),
};

const STATION_FILTER_PARAM: UrlParamCodec<number | null> = {
  parse: (raw) => (raw !== null && /^\d+$/.test(raw) ? Number(raw) : null),
  serialize: (value) => (value === null ? null : String(value)),
};

export interface UseOrderBookOrchestrationArgs {
  selectedTypeId: number | null;
  selectedItem: MarketTypeEntry | null;
  effectiveLocation: MarketLocationParam;
  effectiveHub: TradeHub;
  allRegions: boolean;
  chosenRegionId: number;
  hubHydrated: boolean;
  locationModeHydrated: boolean;
  catalogue: MarketCatalogue;
  activeCharacterId: number | null;
  ensureBlueprintCatalog: () => void;
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
  rangeAcross: boolean;
  singleRegionId: number | null;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride> | null;

  stationFilter: number | null;
  setStationFilter: (next: number | null) => void;
  stationFilterLabel: string | null;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;

  browserFilterValue: BrowserFilterValue;
  handleBrowserFiltersChange: (next: BrowserFilterValue) => void;
  activeFilters: ActiveFilter<BrowserFilterValue>[];
  filtersNarrowBook: boolean;

  orderBookFailed: boolean;
  regionsUnavailable: boolean;
  orderBookView: OrderBookView | null;
  loadedView: LoadedOrderBookView | null;
  sortedSell: readonly RegionOrder[];
  sortedBuy: readonly RegionOrder[];
  shownSell: readonly RegionOrder[];
  hiddenBaitCount: number;
  depthByOrder: ReadonlyMap<number, DepthAt>;
  sellShowAll: boolean;
  setSellShowAll: (next: boolean) => void;
  buyShowAll: boolean;
  setBuyShowAll: (next: boolean) => void;

  failedRegionCount: number;
  jumpNoteShown: boolean;

  variationsResult: VariationsResult | null;
  variationPrices: ReadonlyMap<number, OrderBookSummary | undefined>;
  headerScopeSummary: OrderBookSummary | undefined;

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
  catalogue,
  activeCharacterId,
  ensureBlueprintCatalog,
  t,
}: UseOrderBookOrchestrationArgs): OrderBookOrchestration {
  const {
    catalogueError,
    npcStations,
    solarSystems,
    marketRegions,
    allMarketRegionIds,
    systemRegions,
    typesByGroup,
    typesById,
    variationIndex,
    npcStationMap: sdeStationMap,
    solarSystemMap,
  } = catalogue;

  const globalMarkets = useGlobalMarketOverrides();
  const globalMarketsMap = globalMarkets ?? NO_GLOBAL_MARKETS;

  const [refreshTick, setRefreshTick] = useState(0);
  const [myOrderIds, setMyOrderIds] = useState<ReadonlySet<number>>(new Set());
  const [sellShowAll, setSellShowAll] = useState(false);
  const [buyShowAll, setBuyShowAll] = useState(false);
  const [stationFilter, setStationFilter] = useUrlParam('browser.station', STATION_FILTER_PARAM);

  const regionMode = effectiveLocation.mode === 'region';
  const filters = useBrowserFilters(regionMode);
  const {
    currentSystem,
    jumpRangeFilter,
    rangeAcross,
    rangeReaches,
    spansStations,
    spaceKinds,
    minQuantity,
    npcOnly,
    hideBait,
  } = filters;
  const fetchesAcross = allRegions || rangeReaches;
  const singleRegionId =
    hubHydrated && locationModeHydrated && filters.hydrated && !fetchesAcross
      ? chosenRegionId
      : null;

  const resetKey = `${selectedTypeId ?? 'none'}:${rangeReaches ? 'range' : `${chosenRegionId}:${allRegions ? 'all' : 'one'}`}`;

  useEffect(() => {
    let cancelled = false;
    void loadAllCharactersOpenOrders()
      .then((snapshot) => {
        if (cancelled) return;
        setMyOrderIds(ownOrderIdSet(snapshot));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

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

  const bookLocation = useMemo<OrderBookLocation>(
    () => (rangeAcross ? { ...orderBookLocation, mode: 'region' } : orderBookLocation),
    [rangeAcross, orderBookLocation]
  );

  const hubRegionName =
    marketRegions?.find((r) => r.id === effectiveHub.regionId)?.name ?? effectiveHub.systemName;

  const { orderBookFetch, orderBookLoading } = useOrderBookFetch({
    selectedTypeId,
    bookLocation,
    resetKey,
    onReset: () => {
      setSellShowAll(false);
      setBuyShowAll(false);
    },
    ready: hubHydrated && locationModeHydrated && filters.hydrated && globalMarkets !== null,
    fetchesAcross,
    jumpRangeFilter,
    marketRegions,
    allMarketRegionIds,
    systemRegions,
    refreshTick,
  });

  const regionsUnavailable = fetchesAcross && catalogueError;
  const settledFetch = regionsUnavailable ? REGIONS_UNAVAILABLE_FETCH : orderBookFetch;
  const spaceSystems = useMemo(
    () => (spansStations && solarSystems ? systemsInSpace(solarSystems, spaceKinds) : null),
    [spansStations, solarSystems, spaceKinds]
  );
  const allowedSystems = useMemo(
    () =>
      spansStations
        ? intersectSystemSets(
            jumpRangeFilter.status === 'ready' ? jumpRangeFilter.allowed : null,
            spaceSystems
          )
        : null,
    [spansStations, jumpRangeFilter, spaceSystems]
  );
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
            { ...bookLocation, stationFilter, allowedSystems, minQuantity, npcStationIds },
            settledFetch
          ),
    [
      settledFetch,
      selectedTypeId,
      bookLocation,
      stationFilter,
      allowedSystems,
      minQuantity,
      npcStationIds,
    ]
  );
  const loadedView = orderBookView?.status === 'failed' ? null : orderBookView;
  const orderBookFailed = orderBookView?.status === 'failed';
  const distanceOf = useMemo(() => {
    const jumps = jumpRangeFilter.jumpsStatus === 'ready' ? jumpRangeFilter.jumps : null;
    return (systemId: number) => jumps?.get(systemId) ?? null;
  }, [jumpRangeFilter]);
  const sortedSell = useMemo(
    () => sortBookSide(loadedView?.sell ?? [], 'sell', distanceOf),
    [loadedView, distanceOf]
  );
  const sortedBuy = useMemo(
    () => sortBookSide(loadedView?.buy ?? [], 'buy', distanceOf),
    [loadedView, distanceOf]
  );
  const npcStationMap = useBookStationMap(sdeStationMap, activeCharacterId, sortedSell, sortedBuy);
  const depthByOrder = useMemo(
    () => new Map([...bookDepth(sortedSell), ...bookDepth(sortedBuy)]),
    [sortedSell, sortedBuy]
  );
  const bestSell = loadedView?.summary.bestSell ?? null;
  const shownSell = useMemo(
    () => (hideBait ? withoutBaitSells(sortedSell, bestSell) : sortedSell),
    [hideBait, sortedSell, bestSell]
  );
  const hiddenBaitCount = sortedSell.length - shownSell.length;
  useEffect(() => {
    if (selectedTypeId !== null && loadedView && sortedSell.length === 0) ensureBlueprintCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ensureBlueprintCatalog` is a ref-guarded no-op past its first call; its identity changing (once, as the catalog lands) is no reason to re-run this.
  }, [selectedTypeId, loadedView, sortedSell.length]);

  const stationFilterLabel = useMemo(() => {
    if (stationFilter === null || orderBookFetch?.status !== 'fetched') return null;
    const order = orderBookFetch.result.orders.find((o) => o.location_id === stationFilter);
    if (!order) return null;
    const location = resolveOrderLocation(order, npcStationMap, solarSystemMap);
    return location.stationName ?? t('market.unknownStructure');
  }, [stationFilter, orderBookFetch, npcStationMap, solarSystemMap, t]);

  const filtersNarrowBook =
    filters.activeFilterCount > (hideBait ? 1 : 0) || stationFilter !== null;

  const failedRegionCount = loadedView?.failedRegionIds.length ?? 0;

  const { variationsResult, variationsResultRef, variationPrices, headerScopeSummary } =
    useVariations({
      selectedTypeId,
      selectedItem,
      variationIndex,
      typesByGroup,
      typesById,
      orderBookLocation,
      chosenRegionId,
      stationFilter,
      ready: hubHydrated && locationModeHydrated && globalMarkets !== null,
      refreshTick,
    });

  const refresh = useCallback(() => {
    if (selectedTypeId !== null) {
      if (fetchesAcross) {
        clearOrderBookViewCacheAcross(selectedTypeId, allMarketRegionIds, bookLocation);
      } else {
        clearOrderBookViewCache(selectedTypeId, orderBookLocation);
      }
    }
    for (const row of variationsResultRef.current?.rows ?? []) {
      clearOrderBookViewCache(row.typeId, orderBookLocation);
    }
    setRefreshTick((n) => n + 1);
  }, [
    selectedTypeId,
    fetchesAcross,
    allMarketRegionIds,
    bookLocation,
    orderBookLocation,
    variationsResultRef,
  ]);

  return useMemo(
    () => ({
      orderBookLoading,
      refreshTick,
      myOrderIds,
      orderBookLocation,
      resolvedRegion,
      hubRegionName,
      currentSystem,
      jumpRangeFilter,
      regionMode,
      rangeAcross,
      singleRegionId,
      globalMarkets,
      stationFilter,
      setStationFilter,
      stationFilterLabel,
      npcStationMap,
      browserFilterValue: filters.browserFilterValue,
      handleBrowserFiltersChange: filters.handleBrowserFiltersChange,
      activeFilters: filters.activeFilters,
      filtersNarrowBook,
      orderBookFailed,
      regionsUnavailable,
      orderBookView,
      loadedView,
      sortedSell,
      sortedBuy,
      shownSell,
      hiddenBaitCount,
      depthByOrder,
      sellShowAll,
      setSellShowAll,
      buyShowAll,
      setBuyShowAll,
      failedRegionCount,
      jumpNoteShown: filters.jumpNoteShown,
      variationsResult,
      variationPrices,
      headerScopeSummary,
      refresh,
    }),
    [
      orderBookLoading,
      refreshTick,
      myOrderIds,
      orderBookLocation,
      resolvedRegion,
      hubRegionName,
      currentSystem,
      jumpRangeFilter,
      regionMode,
      rangeAcross,
      singleRegionId,
      globalMarkets,
      stationFilter,
      setStationFilter,
      stationFilterLabel,
      npcStationMap,
      filters.browserFilterValue,
      filters.handleBrowserFiltersChange,
      filters.activeFilters,
      filtersNarrowBook,
      orderBookFailed,
      regionsUnavailable,
      orderBookView,
      loadedView,
      sortedSell,
      sortedBuy,
      shownSell,
      hiddenBaitCount,
      depthByOrder,
      sellShowAll,
      buyShowAll,
      failedRegionCount,
      filters.jumpNoteShown,
      variationsResult,
      variationPrices,
      headerScopeSummary,
      refresh,
    ]
  );
}
