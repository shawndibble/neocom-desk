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
  fromCache?: boolean;
}

type MarketHistoryOutcome =
  { kind: 'history'; entries: MarketHistoryEntry[] } | { kind: 'not-tradable' };

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
  return { points, fetchedAt: cached.fetchedAt.getTime(), fromCache: cached.fromCache };
}
