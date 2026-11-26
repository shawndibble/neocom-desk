import { getMarketOrders } from '@/esi/endpoints';
import type { LiveOrder } from '@/engine/market/liveBook';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { TradeHub } from '@/market/hubs';

export const LIVE_BOOK_TTL_MS = 600_000;

export const LIVE_BOOK_CONCURRENCY = 12;

export interface LiveBook {
  orders: LiveOrder[];
  fetchedAt: number;
}

export interface LiveBookRequest {
  hub: TradeHub;
  typeId: number;
}

type Clock = () => number;

const cache = new Map<string, LiveBook>();
const inFlight = new Map<string, Promise<LiveBook>>();

function keyOf({ hub, typeId }: LiveBookRequest): string {
  return `${hub.stationId}:${typeId}`;
}

export function clearLiveBooks(): void {
  cache.clear();
  inFlight.clear();
}

export function peekLiveBook(
  request: LiveBookRequest,
  now: Clock = Date.now
): LiveBook | undefined {
  const book = cache.get(keyOf(request));
  return book !== undefined && now() - book.fetchedAt < LIVE_BOOK_TTL_MS ? book : undefined;
}

export async function getLiveBook(
  request: LiveBookRequest,
  { force = false, now = Date.now }: { force?: boolean; now?: Clock } = {}
): Promise<LiveBook> {
  const key = keyOf(request);
  if (!force) {
    const cached = peekLiveBook(request, now);
    if (cached !== undefined) return cached;
  }
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;

  const promise = (async () => {
    const fetchedAt = now();
    const { items, truncated } = await getMarketOrders(request.hub.regionId, request.typeId);
    if (truncated)
      throw new Error(`order book ${request.hub.regionId}:${request.typeId} truncated`);
    const orders = items
      .filter((order) => order.is_buy_order || order.location_id === request.hub.stationId)
      .map(
        ({
          order_id,
          is_buy_order,
          location_id,
          price,
          system_id,
          range,
          min_volume,
          volume_remain,
        }) => ({
          order_id,
          is_buy_order,
          location_id,
          price,
          system_id,
          range,
          min_volume,
          volume_remain,
        })
      );
    const book: LiveBook = { orders, fetchedAt };
    cache.set(key, book);
    return book;
  })();
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

export async function loadLiveBooks(
  requests: readonly LiveBookRequest[],
  onSettled: (request: LiveBookRequest, result: LiveBook | 'failed') => void,
  options: { force?: boolean; now?: Clock; isCancelled?: () => boolean } = {}
): Promise<void> {
  const { isCancelled, ...bookOptions } = options;
  await mapWithConcurrencyLimit(requests, LIVE_BOOK_CONCURRENCY, async (request) => {
    if (isCancelled?.()) return;
    let result: LiveBook | 'failed';
    try {
      result = await getLiveBook(request, bookOptions);
    } catch {
      result = 'failed';
    }
    onSettled(request, result);
  });
}
