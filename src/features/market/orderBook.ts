/**
 * Order Book fetch + cache: one item in one region, held for the 300 seconds
 * ESI itself caches them (ADR 0003). In-memory TTL cache mirroring
 * `src/market/prices.ts` — no Dexie, this is live market depth, not an
 * estimate worth persisting across sessions.
 */
import { getMarketOrders, type RegionOrder } from '@/esi/endpoints';

export const ORDER_BOOK_TTL_MS = 300_000;

/** Injectable so tests can move time without waiting on it. Defaults to wall-clock. */
export type Clock = () => number;

export interface OrderBookResult {
  orders: RegionOrder[];
  /** True if the region had more pages than fetchAllPagesStatus collected. */
  truncated: boolean;
  /** When this result was actually fetched — preserved across cache hits, for the Data Age badge. */
  fetchedAt: number;
}

interface CacheEntry {
  result: OrderBookResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

/** Manual refresh bypasses the TTL — "Data Age: refresh on app open + manual button only" (CONTEXT.md). */
export function clearOrderBookCache(): void {
  cache.clear();
}

/** Order Book for typeId in regionId, from cache where fresh, else a live ESI fetch. */
export async function getOrderBook(
  regionId: number,
  typeId: number,
  now: Clock = Date.now
): Promise<OrderBookResult> {
  const nowMs = now();
  const key = cacheKey(regionId, typeId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > nowMs) return cached.result;

  const { items, truncated } = await getMarketOrders(regionId, typeId);
  const result: OrderBookResult = { orders: items, truncated, fetchedAt: nowMs };
  cache.set(key, { result, expiresAt: nowMs + ORDER_BOOK_TTL_MS });
  return result;
}
