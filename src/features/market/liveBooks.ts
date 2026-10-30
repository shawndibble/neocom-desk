/**
 * The Appraisal page's live order books (issue #5591): one item's region book
 * folded to a hub station's orders, fetched through the shared ESI client
 * (`getMarketOrders`: `X-Compatibility-Date`, `X-User-Agent`, `X-Ratelimit-*`
 * and `Retry-After` handled there and by the app-wide budget).
 *
 * A fetched book is reused for ten minutes, longer than ESI's own 300 s on
 * purpose (owner decision: fewer calls), so re-appraising or copying the same
 * types makes no new requests. Only a manual Refresh (`force`) refetches
 * whatever the age. In-memory only: this is live depth, not worth persisting.
 * Deliberately not `orderBook.ts`'s cache: that one is the Browser's, keyed by
 * region and kept at 300 s.
 */
import { getMarketOrders } from '@/esi/endpoints';
import type { LiveOrder } from '@/engine/market/liveBook';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { TradeHub } from '@/market/hubs';

export const LIVE_BOOK_TTL_MS = 600_000;

/** Rows fetched at once: one hub prices 200 items in about 4 s at this width (measured, #5591). */
export const LIVE_BOOK_CONCURRENCY = 12;

export interface LiveBook {
  /** Only the hub station's orders. */
  orders: LiveOrder[];
  /** When ESI was asked, kept across cache hits for "checked N s ago". */
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

/** Test-only reset. */
export function clearLiveBooks(): void {
  cache.clear();
  inFlight.clear();
}

/** The cached book if it is still inside the TTL, else undefined; never fetches. */
export function peekLiveBook(
  request: LiveBookRequest,
  now: Clock = Date.now
): LiveBook | undefined {
  const book = cache.get(keyOf(request));
  return book !== undefined && now() - book.fetchedAt < LIVE_BOOK_TTL_MS ? book : undefined;
}

/**
 * The live book for one request. Throws when ESI fails or returns a region
 * book it could not read whole: a partial book would be a wrong best price,
 * so the caller marks the row failed instead.
 */
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
      .filter((order) => order.location_id === request.hub.stationId)
      .map(({ order_id, is_buy_order, location_id, price }) => ({
        order_id,
        is_buy_order,
        location_id,
        price,
      }));
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

/**
 * Fetches every request at `LIVE_BOOK_CONCURRENCY`, in the order given (most
 * valuable first), reporting each as it settles. Never rejects: a failed
 * request settles as `'failed'` so one bad row leaves the rest untouched.
 * Once `isCancelled` is true, requests not yet started are skipped (and not
 * reported); those already in flight finish and still fill the cache.
 */
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
