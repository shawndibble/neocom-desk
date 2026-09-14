/** Price History fetch: one item's daily market history for a region, from ESI (public, ADR 0003 sibling). */
import { getMarketHistory } from '@/esi/endpoints';
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
  const { data } = await getMarketHistory(regionId, typeId);
  const points = sortPriceHistory(
    (data ?? []).map((entry) => ({
      date: entry.date,
      average: entry.average,
      highest: entry.highest,
      lowest: entry.lowest,
      volume: entry.volume,
      orderCount: entry.order_count,
    }))
  );
  return { points, fetchedAt: Date.now() };
}
