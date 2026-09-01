/** Price History fetch: one item's daily market history for a region, from ESI (public, ADR 0003 sibling). */
import { getMarketHistory } from '@/esi/endpoints';
import { sortPriceHistory, type MarketHistoryPoint } from '@/engine/market/priceHistory';

export interface PriceHistoryResult {
  points: MarketHistoryPoint[];
  fetchedAt: number;
}

/** Daily average price + traded volume for typeId in regionId, sorted chronologically. */
export async function loadPriceHistory(
  regionId: number,
  typeId: number
): Promise<PriceHistoryResult> {
  const { data } = await getMarketHistory(regionId, typeId);
  const points = sortPriceHistory(
    (data ?? []).map((entry) => ({
      date: entry.date,
      average: entry.average,
      volume: entry.volume,
    }))
  );
  return { points, fetchedAt: Date.now() };
}
