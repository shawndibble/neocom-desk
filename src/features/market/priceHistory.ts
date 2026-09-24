/** Price History fetch: one item's daily market history for a region, from ESI (public, ADR 0003 sibling). */
import { getMarketHistory, type MarketHistoryEntry } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  loadWithCache,
  type ExpiresCapture,
} from '@/esi/cache';
import { EsiError } from '@/esi/errors';
import { sortPriceHistory, type MarketHistoryPoint } from '@/engine/market/priceHistory';

export interface PriceHistoryResult {
  points: MarketHistoryPoint[];
  fetchedAt: number;
}

/**
 * What ESI answered for one region+type, as cached. ESI 400s a type that has
 * no market (non-tradable ore/ice variants such as Banidine) rather than
 * returning an empty list; that answer is cached too, so a revisit does not
 * re-ask ESI the same question per type.
 */
type MarketHistoryOutcome =
  { kind: 'history'; entries: MarketHistoryEntry[] } | { kind: 'not-tradable' };

/**
 * One day per entry for typeId in regionId, sorted chronologically.
 *
 * Every field ESI sends is kept. The endpoint has always returned the day's
 * `highest`, `lowest` and `order_count` alongside the average and the volume;
 * dropping them here cost a second request to get them back later, and the
 * chart wants all five.
 *
 * Read through the shared cache until ESI's own `Expires` (the next daily
 * history rollover), so a revisit of a page that fans out one call per type
 * (the Mining Overview asks for every ore and mineral) costs no requests.
 *
 * Rejects with an `EsiError` status 400 for a type with no market, which the
 * Mining Overview tolerates per type; any other failure with nothing cached
 * rejects with a plain `Error`.
 */
export async function loadPriceHistory(
  regionId: number,
  typeId: number
): Promise<PriceHistoryResult> {
  const expiresCapture: ExpiresCapture = { value: null };
  const cached = await loadWithCache<MarketHistoryOutcome>(
    GLOBAL_CACHE_CHARACTER_ID,
    `market-history:${regionId}:${typeId}`,
    async () => {
      try {
        const result = await getMarketHistory(regionId, typeId);
        expiresCapture.value = result.expires;
        return { kind: 'history', entries: result.data ?? [] };
      } catch (err) {
        if (err instanceof EsiError && err.status === 400) return { kind: 'not-tradable' };
        throw err;
      }
    },
    { expiresCapture, staleAfterMs: STALE_AFTER.default }
  );
  if (!cached) throw new Error(`Market history unavailable for type ${typeId}`);
  if (cached.data.kind === 'not-tradable') {
    throw new EsiError(400, `Type ${typeId} has no market history`);
  }
  const points = sortPriceHistory(
    cached.data.entries.map((entry) => ({
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
