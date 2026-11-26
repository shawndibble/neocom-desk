import { useEffect, useMemo } from 'react';
import type { RegionOrder } from '@/esi/endpoints';
import { isOfflineFailure } from '@/esi/client';
import { passesOrderFilters } from '@/engine/market/orderBookFilters';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadGlobalMarkets } from '@/sde/loadMarketSde';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import {
  ALL_REGIONS,
  resolveOrderBookRegion,
  type GlobalMarketOverride,
  type RegionChoice,
  type ResolvedOrderBookRegion,
} from '@/engine/market/locationMode';
import {
  filterOrdersByLocation,
  splitOrderBook,
  summarizeOrderBook,
  type OrderBookSummary,
} from '@/engine/market/orderBook';
import { useHubFor } from './hub';
import { useLocationMode, type LocationMode } from './locationMode';
import {
  clearOrderBookCache,
  getOrderBook,
  ORDER_BOOK_FANOUT_CONCURRENCY,
  type OrderBookResult,
} from './orderBook';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface OrderBookLocation {
  mode: LocationMode;
  regionId: number;
  hubStationId: number;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>;
  stationFilter?: number | null;
  allowedSystems?: ReadonlySet<number> | null;
  minQuantity?: number;
  npcStationIds?: ReadonlySet<number> | null;
}

export type OrderBookFetch =
  | {
      status: 'fetched';
      result: OrderBookResult;
      failedRegionIds?: readonly number[];
    }
  | { status: 'failed'; error: unknown };

interface OrderBookViewBase {
  region: ResolvedOrderBookRegion;
}

export interface LoadedOrderBookView extends OrderBookViewBase {
  status: 'ready' | 'empty';
  sell: RegionOrder[];
  buy: RegionOrder[];
  summary: OrderBookSummary;
  fetchedAt: number;
  truncated: boolean;
  failedRegionIds: readonly number[];
}

export interface FailedOrderBookView extends OrderBookViewBase {
  status: 'failed';
  error: unknown;
}

export type OrderBookView = LoadedOrderBookView | FailedOrderBookView;

export function orderBookFailedOffline(view: OrderBookView | null | undefined, online: boolean) {
  if (!view || view.status !== 'failed') return false;
  return !online || isOfflineFailure(view.error);
}

function regionFor(typeId: number, location: OrderBookLocation): ResolvedOrderBookRegion {
  return resolveOrderBookRegion(typeId, location.regionId, location.globalMarkets);
}

export async function fetchOrderBook(
  typeId: number,
  location: OrderBookLocation
): Promise<OrderBookFetch> {
  try {
    const result = await getOrderBook(regionFor(typeId, location).regionId, typeId);
    return { status: 'fetched', result };
  } catch (error) {
    return { status: 'failed', error };
  }
}

export async function fetchOrderBookAcross(
  typeId: number,
  regionIds: readonly number[],
  location: OrderBookLocation,
  cancelled: () => boolean = () => false
): Promise<OrderBookFetch> {
  if (location.globalMarkets.has(typeId)) return fetchOrderBook(typeId, location);
  const results: OrderBookResult[] = [];
  const failedRegionIds: number[] = [];
  let firstError: unknown = null;
  await mapWithConcurrencyLimit(regionIds, ORDER_BOOK_FANOUT_CONCURRENCY, async (regionId) => {
    if (cancelled()) return;
    try {
      results.push(await getOrderBook(regionId, typeId));
    } catch (error) {
      firstError ??= error;
      failedRegionIds.push(regionId);
    }
  });
  if (regionIds.length > 0 && results.length === 0 && failedRegionIds.length > 0) {
    return { status: 'failed', error: firstError };
  }
  return {
    status: 'fetched',
    result: {
      orders: results.flatMap((r) => r.orders),
      truncated: results.some((r) => r.truncated),
      fetchedAt: results.length === 0 ? Date.now() : Math.min(...results.map((r) => r.fetchedAt)),
    },
    failedRegionIds: failedRegionIds.sort((a, b) => a - b),
  };
}

export function buildOrderBookView(
  typeId: number,
  location: OrderBookLocation,
  fetched: OrderBookFetch
): OrderBookView {
  const region = regionFor(typeId, location);
  if (fetched.status === 'failed') return { status: 'failed', region, error: fetched.error };

  const atLocation =
    location.mode === 'hub'
      ? filterOrdersByLocation(fetched.result.orders, location.hubStationId)
      : fetched.result.orders;
  const orders = filterOrdersByLocation(atLocation, location.stationFilter ?? null).filter(
    (order) => passesOrderFilters(order, location)
  );
  const { sell, buy } = splitOrderBook(orders);
  sell.sort((a, b) => a.price - b.price);
  buy.sort((a, b) => b.price - a.price);
  return {
    status: orders.length === 0 ? 'empty' : 'ready',
    region,
    sell,
    buy,
    summary: summarizeOrderBook(orders),
    fetchedAt: fetched.result.fetchedAt,
    truncated: fetched.result.truncated,
    failedRegionIds: fetched.failedRegionIds ?? [],
  };
}

export async function loadOrderBookView(
  typeId: number,
  location: OrderBookLocation
): Promise<OrderBookView> {
  return buildOrderBookView(typeId, location, await fetchOrderBook(typeId, location));
}

export function clearOrderBookViewCache(typeId: number, location: OrderBookLocation): void {
  clearOrderBookCache(regionFor(typeId, location).regionId, typeId);
}

export function clearOrderBookViewCacheAcross(
  typeId: number,
  regionIds: readonly number[],
  location: OrderBookLocation
): void {
  for (const regionId of regionIds) clearOrderBookCache(regionId, typeId);
  clearOrderBookViewCache(typeId, location);
}

export function orderBookLocationFor(
  mode: LocationMode,
  regionId: RegionChoice | null,
  hub: { regionId: number; stationId: number },
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>
): OrderBookLocation {
  return {
    mode,
    regionId:
      mode === 'region' && regionId !== null && regionId !== ALL_REGIONS ? regionId : hub.regionId,
    hubStationId: hub.stationId,
    globalMarkets,
  };
}

export async function loadGlobalMarketOverrides(): Promise<
  ReadonlyMap<number, GlobalMarketOverride>
> {
  try {
    const entries = await loadGlobalMarkets();
    return new Map(
      entries.map((g) => [g.typeId, { regionId: g.regionId, regionName: g.regionName }])
    );
  } catch {
    return new Map();
  }
}

export function useGlobalMarketOverrides(
  enabled = true
): ReadonlyMap<number, GlobalMarketOverride> | null {
  return useKeyedLoad('overrides', loadGlobalMarketOverrides, !enabled).data ?? null;
}

export function useSavedOrderBookLocation(enabled = true): OrderBookLocation | null {
  const { hubId, hydrated: hubHydrated } = useHubFor('market');
  const locationMode = useLocationMode((state) => state.value);
  const locationModeHydrated = useLocationMode((state) => state.hydrated);
  const hydrateLocationMode = useLocationMode((state) => state.hydrate);
  const globalMarkets = useGlobalMarketOverrides(enabled);

  useEffect(() => {
    if (!enabled) return;
    void hydrateLocationMode();
  }, [enabled, hydrateLocationMode]);

  return useMemo(() => {
    if (!enabled || !hubHydrated || !locationModeHydrated || !globalMarkets) return null;
    return orderBookLocationFor(
      locationMode.mode,
      locationMode.regionId,
      getTradeHub(hubId) ?? DEFAULT_TRADE_HUB,
      globalMarkets
    );
  }, [enabled, hubHydrated, locationModeHydrated, globalMarkets, hubId, locationMode]);
}
