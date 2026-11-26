import { getMarketOrders, type RegionOrder } from '@/esi/endpoints';

export const ORDER_BOOK_TTL_MS = 300_000;

export const ORDER_BOOK_FANOUT_CONCURRENCY = 4;

export type Clock = () => number;

export interface OrderBookResult {
  orders: RegionOrder[];
  truncated: boolean;
  fetchedAt: number;
}

interface CacheEntry {
  result: OrderBookResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const inFlight = new Map<string, Promise<OrderBookResult>>();

function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

export function clearOrderBookCache(regionId?: number, typeId?: number): void {
  if (regionId === undefined || typeId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(regionId, typeId));
}

export async function getOrderBook(
  regionId: number,
  typeId: number,
  now: Clock = Date.now
): Promise<OrderBookResult> {
  const nowMs = now();
  const key = cacheKey(regionId, typeId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > nowMs) return cached.result;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const { items, truncated } = await getMarketOrders(regionId, typeId);
    const result: OrderBookResult = { orders: items, truncated, fetchedAt: nowMs };
    cache.set(key, { result, expiresAt: nowMs + ORDER_BOOK_TTL_MS });
    return result;
  })();
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}
