/**
 * Order Book view: one item under one location selection, turned into what
 * every caller actually shows — sell/buy rows sorted best-first, the Compare
 * summary, and whether the book loaded at all. Region resolution (Global
 * Market Region override), the Trade Hub station filter, the order-row
 * "filter to this station" narrowing, split, sort and summary all live here,
 * so the Market Browser's tables, its Variations rows, the Compare Drawer and
 * Item Detail can't compose them differently and disagree about one item.
 * The 300s cache stays underneath, in `getOrderBook` (ADR 0003).
 *
 * A failed fetch (a 420, or the Error Budget gate declining to send) is its
 * own `'failed'` status — never an empty book, which would tell the pilot
 * nobody is trading the item when the truth is we couldn't ask.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RegionOrder } from '@/esi/endpoints';
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
import { useMarketHub } from './hub';
import { useLocationMode, type LocationMode } from './locationMode';
import {
  clearOrderBookCache,
  getOrderBook,
  ORDER_BOOK_FANOUT_CONCURRENCY,
  type OrderBookResult,
} from './orderBook';

export interface OrderBookLocation {
  mode: LocationMode;
  /**
   * The Location Mode's chosen region: the picked Region, or the Trade Hub's
   * region. Always one region — All regions reads the hub's here, and only
   * the Market Browser's own book fans out (`fetchOrderBookAcross`).
   */
  regionId: number;
  /** The Trade Hub's own station; read only in `'hub'` mode. */
  hubStationId: number;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>;
  /** The order-row "filter to this station" narrowing, applied on top of the mode. */
  stationFilter?: number | null;
  /** Jump Range and Security (Market Browser, Region mode) as one allowed-system set, or `null`/absent for no restriction. */
  allowedSystems?: ReadonlySet<number> | null;
  /** Min quantity: orders with less `volume_remain` drop out. */
  minQuantity?: number;
  /** NPC stations only: the SDE's NPC station ids; an order anywhere else (a player structure) drops out. */
  npcStationIds?: ReadonlySet<number> | null;
}

/** What `fetchOrderBook` settled to — kept apart from the view so a station filter change re-derives without refetching. */
export type OrderBookFetch =
  | {
      status: 'fetched';
      result: OrderBookResult;
      /** All regions only: regions whose book didn't load, so the view can say what's missing. */
      failedRegionIds?: readonly number[];
    }
  | { status: 'failed'; error: unknown };

interface OrderBookViewBase {
  /** Where the book was read from; non-null `override` means a Global Market Region won. */
  region: ResolvedOrderBookRegion;
}

export interface LoadedOrderBookView extends OrderBookViewBase {
  /** `'empty'` when neither side has an order at the location. */
  status: 'ready' | 'empty';
  /** Cheapest first. */
  sell: RegionOrder[];
  /** Highest first. */
  buy: RegionOrder[];
  summary: OrderBookSummary;
  fetchedAt: number;
  truncated: boolean;
  /** All regions only: regions missing from this book because their fetch failed. Empty otherwise. */
  failedRegionIds: readonly number[];
}

export interface FailedOrderBookView extends OrderBookViewBase {
  status: 'failed';
  error: unknown;
}

export type OrderBookView = LoadedOrderBookView | FailedOrderBookView;

function regionFor(typeId: number, location: OrderBookLocation): ResolvedOrderBookRegion {
  return resolveOrderBookRegion(typeId, location.regionId, location.globalMarkets);
}

/** Fetches typeId's region book for location (cached underneath). Never rejects. */
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

/**
 * All regions: typeId's book in each of `regionIds`, merged into one fetch so
 * `buildOrderBookView` derives it exactly like a single region's. Each region
 * goes through `getOrderBook` (cached, coalesced), a few at a time. A region
 * that fails is named in `failedRegionIds`, never silently dropped; only all
 * of them failing is `'failed'`. A Global Market Region item still reads its
 * one region. `cancelled` stops new regions starting once the caller has
 * moved on, so a quick item switch doesn't keep spending the ESI budget.
 * Never rejects.
 */
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
      // The oldest region is how stale this book is.
      fetchedAt: results.length === 0 ? Date.now() : Math.min(...results.map((r) => r.fetchedAt)),
    },
    failedRegionIds: failedRegionIds.sort((a, b) => a - b),
  };
}

/** Derives the view from a settled fetch. Synchronous, so a filter change never costs a request. */
export function buildOrderBookView(
  typeId: number,
  location: OrderBookLocation,
  fetched: OrderBookFetch
): OrderBookView {
  const region = regionFor(typeId, location);
  if (fetched.status === 'failed') return { status: 'failed', region, error: fetched.error };

  // A Global Market Region's orders still point at ordinary stations, so the
  // Trade Hub filter applies on top of an override too (CONTEXT.md).
  const atLocation =
    location.mode === 'hub'
      ? filterOrdersByLocation(fetched.result.orders, location.hubStationId)
      : fetched.result.orders;
  // Jump Range/Security (by system_id), Min quantity and NPC stations only
  // narrow next to the station filter, so the summary, best price, spread and
  // row cap all read the same set the table shows — never applied after the
  // fact (CONTEXT.md: Jump Range).
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

/** Fetch + build in one step, for callers that don't re-derive under a changing filter. Never rejects. */
export async function loadOrderBookView(
  typeId: number,
  location: OrderBookLocation
): Promise<OrderBookView> {
  return buildOrderBookView(typeId, location, await fetchOrderBook(typeId, location));
}

/** Manual refresh: drops the cached book this location actually reads typeId from. */
export function clearOrderBookViewCache(typeId: number, location: OrderBookLocation): void {
  clearOrderBookCache(regionFor(typeId, location).regionId, typeId);
}

/** Manual refresh for All regions: drops typeId's cached book in every region given (plus a Global Market Region's). */
export function clearOrderBookViewCacheAcross(
  typeId: number,
  regionIds: readonly number[],
  location: OrderBookLocation
): void {
  for (const regionId of regionIds) clearOrderBookCache(regionId, typeId);
  clearOrderBookViewCache(typeId, location);
}

/**
 * A Location Mode selection as an `OrderBookLocation`: Trade Hub mode reads
 * the hub's region and station; Region mode reads the picked region, or the
 * hub's until one is picked — and the hub's for All regions too, since this
 * location is one region by construction (see `regionId`). The Market Browser (URL-aware) and Item Detail
 * (saved preference) both build their location through this.
 */
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

/**
 * globalMarkets.json as a typeId lookup. Never rejects: a failed read
 * degrades to no overrides — the chosen region is read instead — rather than
 * leaving an order book waiting on it forever.
 */
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

/** `loadGlobalMarketOverrides` as state: null until it settles (success or not). */
export function useGlobalMarketOverrides(
  enabled = true
): ReadonlyMap<number, GlobalMarketOverride> | null {
  const [overrides, setOverrides] = useState<ReadonlyMap<number, GlobalMarketOverride> | null>(
    null
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadGlobalMarketOverrides().then((map) => {
      if (!cancelled) setOverrides(map);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return overrides;
}

/**
 * The saved Location Mode + Trade Hub (+ Global Market Regions) as an
 * `OrderBookLocation` — what the Market Browser itself falls back to when no
 * link overrides it. Null until all three have settled, so a book isn't
 * fetched once for the defaults and again for the real preference.
 */
export function useSavedOrderBookLocation(enabled = true): OrderBookLocation | null {
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const locationMode = useLocationMode((state) => state.value);
  const locationModeHydrated = useLocationMode((state) => state.hydrated);
  const hydrateLocationMode = useLocationMode((state) => state.hydrate);
  const globalMarkets = useGlobalMarketOverrides(enabled);

  useEffect(() => {
    if (!enabled) return;
    void hydrateHub();
    void hydrateLocationMode();
  }, [enabled, hydrateHub, hydrateLocationMode]);

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
