/** Price History fetch: one item's daily market history for a region, from ESI (public, ADR 0003 sibling). */
import { getMarketHistory, type MarketHistoryEntry } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  loadWithCache,
  type ExpiresCapture,
} from '@/esi/cache';
import { sortPriceHistory, type MarketHistoryPoint } from '@/engine/market/priceHistory';

export interface PriceHistoryResult {
  points: MarketHistoryPoint[];
  fetchedAt: number;
}

/**
 * One day per entry for typeId in regionId, sorted chronologically.
 *
 * Every field ESI sends is kept. The endpoint has always returned the day's
 * `highest`, `lowest` and `order_count` alongside the average and the volume;
 * dropping them here cost a second request to get them back later, and the
 * chart wants all five.
 */
export async function loadPriceHistory(
  regionId: number,
  typeId: number
): Promise<PriceHistoryResult> {
  // Read through the shared cache until ESI's own `Expires` (the next daily
  // history rollover), so a revisit of a page that fans out one call per type
  // — the Mining Overview asks for every ore and mineral — costs no requests.
  // The live error is kept aside and rethrown when nothing is cached: callers
  // tell a 400 (not tradable) apart from an outage, and `loadWithCache` alone
  // would flatten both to `null`.
  const expiresCapture: ExpiresCapture = { value: null };
  let liveError: unknown = null;
  const cached = await loadWithCache<MarketHistoryEntry[]>(
    GLOBAL_CACHE_CHARACTER_ID,
    `market-history:${regionId}:${typeId}`,
    async () => {
      try {
        const result = await getMarketHistory(regionId, typeId);
        expiresCapture.value = result.expires;
        return result.data ?? [];
      } catch (err) {
        liveError = err;
        throw err;
      }
    },
    { expiresCapture, staleAfterMs: STALE_AFTER.default }
  );
  if (!cached) throw liveError ?? new Error('Market history unavailable');
  const points = sortPriceHistory(
    cached.data.map((entry) => ({
      date: entry.date,
      average: entry.average,
      highest: entry.highest,
      lowest: entry.lowest,
      volume: entry.volume,
      orderCount: entry.order_count,
    }))
  );
  return { points, fetchedAt: cached.fetchedAt.getTime() };
}
