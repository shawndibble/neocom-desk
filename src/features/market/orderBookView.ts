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
import type { RegionOrder } from '@/esi/endpoints';
import {
  resolveOrderBookRegion,
  type GlobalMarketOverride,
  type ResolvedOrderBookRegion,
} from '@/engine/market/locationMode';
import {
  filterOrdersByLocation,
  splitOrderBook,
  summarizeOrderBook,
  type OrderBookSummary,
} from '@/engine/market/orderBook';
import type { LocationMode } from './locationMode';
import { clearOrderBookCache, getOrderBook, type OrderBookResult } from './orderBook';

export interface OrderBookLocation {
  mode: LocationMode;
  /** The Location Mode's chosen region: the picked Region, or the Trade Hub's region. */
  regionId: number;
  /** The Trade Hub's own station; read only in `'hub'` mode. */
  hubStationId: number;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>;
  /** The order-row "filter to this station" narrowing, applied on top of the mode. */
  stationFilter?: number | null;
}

/** What `fetchOrderBook` settled to — kept apart from the view so a station filter change re-derives without refetching. */
export type OrderBookFetch =
  { status: 'fetched'; result: OrderBookResult } | { status: 'failed'; error: unknown };

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
  const orders = filterOrdersByLocation(atLocation, location.stationFilter ?? null);
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
