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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlParam } from '@/lib/useUrlState';
import type { UrlParamCodec } from '@/lib/urlState';
import { intersectSystemSets, systemsInSpace } from '@/engine/market/orderBookFilters';
import type { CurrentSystemState, JumpRangeFilter } from '@/features/route/currentSystem';
import { useBrowserFilters, type BrowserFilterValue } from '@/features/market/useBrowserFilters';
import { useOrderBookFetch } from '@/features/market/useOrderBookFetch';
import { useVariations } from '@/features/market/useVariations';
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
import { resolveOrderLocation, type OrderBookSummary } from '@/engine/market/orderBook';
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

/** Stand-in until globalMarkets.json settles; the order book waits for the real one. */
const NO_GLOBAL_MARKETS: ReadonlyMap<number, GlobalMarketOverride> = new Map();

const REGIONS_UNAVAILABLE_FETCH: OrderBookFetch = {
  status: 'failed',
  error: new Error('Market Region catalogue unavailable'),
};

/** `stationFilter`, URL-backed: a positive location id, or `null`. */
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
  /** A set, measurable Jump Range: the book spans every region in reach, not the header's hub or region. */
  rangeAcross: boolean;

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
  /** Best-first, a price tie broken by distance from the Current System (`sortBookSide`). */
  sortedSell: readonly RegionOrder[];
  sortedBuy: readonly RegionOrder[];
  /**
   * `sortedSell` as the table shows it: without bait sells when Hide bait
   * sells is on (`withoutBaitSells`), else the same rows. Depth, best prices
   * and CSV export keep reading `sortedSell`, the real book.
   */
  shownSell: readonly RegionOrder[];
  /** Sells Hide bait sells is keeping out of `shownSell`; 0 when it is off. */
  hiddenBaitCount: number;
  /** Running units/ISK per order id, each side walked best-first. */
  depthByOrder: ReadonlyMap<number, DepthAt>;
  sellShowAll: boolean;
  setSellShowAll: (next: boolean) => void;
  buyShowAll: boolean;
  setBuyShowAll: (next: boolean) => void;

  failedRegionCount: number;
  jumpNoteShown: boolean;

  variationsResult: VariationsResult | null;
  variationPrices: ReadonlyMap<number, OrderBookSummary | undefined>;
  /**
   * The selected item's own book at the header's hub or region — what the
   * Variations rows are priced against, and what a Jump Range's hub
   * comparison reads. `undefined` until it loads.
   */
  headerScopeSummary: OrderBookSummary | undefined;

  /** Bypasses every TTL cache for what's on screen, then bumps `refreshTick` (GLOSSARY.md "Data Age"). */
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
    npcStationMap,
    solarSystemMap,
  } = catalogue;

  // Loaded independently, not with the SDE catalogue: the order book waits
  // only on this (never on the whole SDE catalogue), and a failed read
  // settles to no overrides rather than leaving the book waiting forever.
  const globalMarkets = useGlobalMarketOverrides();
  const globalMarketsMap = globalMarkets ?? NO_GLOBAL_MARKETS;

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
  // The order row context menu's "filter to this station" action (GLOSSARY.md
  // round 10); undone via the banner rendered above the tables. URL-backed
  // (ADR 0015), scoped to the Browser tab.
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

  // A range that reaches out ignores the header's hub and region entirely, so
  // changing them (or the range resolving) is no new book.
  const resetKey = `${selectedTypeId ?? 'none'}:${rangeReaches ? 'range' : `${chosenRegionId}:${allRegions ? 'all' : 'one'}`}`;

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
        setMyOrderIds(ownOrderIdSet(snapshot));
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

  // The Browser's own book: a range fanned out over regions reads every
  // station in them, so it drops the hub's one-station filter. Variations,
  // Compare and Item Detail keep `orderBookLocation`, as with All regions.
  const bookLocation = useMemo<OrderBookLocation>(
    () => (rangeAcross ? { ...orderBookLocation, mode: 'region' } : orderBookLocation),
    [rangeAcross, orderBookLocation]
  );

  const hubRegionName =
    marketRegions?.find((r) => r.id === effectiveHub.regionId)?.name ?? effectiveHub.systemName;

  // Gated on the hydrated flags and globalMarkets.json settling (success
  // or failure) — see `useOrderBookFetch`.
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

  // Location Mode, Trade Hub station, the order-row "filter to this station"
  // action (GLOSSARY.md round 10), the filter bar, split and sort all happen
  // in the view.
  // A fan-out (All regions, or a range) with no region catalogue has no
  // "every region" to read: a failed book (with its retry), not a spinner
  // waiting on a list that isn't coming.
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
  // Distances are known at every range (`useJumpRangeFilter`), so a price
  // tie leads with the nearer order even with no range set. The tables sort
  // stably on price, so this order survives their own default sort.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ensureBlueprintCatalog` is a ref-guarded no-op past its first call; its identity changing (once, as the catalog lands) is no reason to re-run this.
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

  // Hide bait sells counts on the badge but never empties a side: the best
  // sell can't be bait against itself, and buys are never hidden — so an
  // empty book is no reason to blame it.
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

  // Manual refresh must bypass getOrderBook's 300s TTL cache (GLOSSARY.md
  // "Data Age": refresh happens on app open + manual button only) — scoped
  // to what's actually on screen (the selected item, plus the Variations
  // table rows beneath it, which reuse this same tick to refetch their own
  // prices in place), not a global wipe. That's the difference from the
  // Compare Drawer: its rows aren't part of this page's own render, so they
  // keep whatever's still within TTL instead of being forced to refetch just
  // because something else on the page was refreshed. Also the failed order
  // book's "Try again".
  const refresh = useCallback(() => {
    // A fan-out clears the type in every region, not just the ones last
    // fetched: a range change since would otherwise leave some stale.
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
      stationFilter,
      setStationFilter,
      stationFilterLabel,
      browserFilterValue: filters.browserFilterValue,
      handleBrowserFiltersChange: filters.handleBrowserFiltersChange,
      activeFilterCount: filters.activeFilterCount,
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
      stationFilter,
      setStationFilter,
      stationFilterLabel,
      filters.browserFilterValue,
      filters.handleBrowserFiltersChange,
      filters.activeFilterCount,
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
