/** A product's latest price against its 90-day median in one region, read from the cached market history. */
import { priceVsMedianPct } from '@/engine/market/priceVsMedian';
import { loadPriceHistory } from './priceHistory';

/**
 * Percent the latest full day sits from the 90-day median (`priceVsMedianPct`),
 * or null when the item has no market there, too little history, or the read
 * failed. Shares `loadPriceHistory`'s cache, so a row whose history another
 * column already read costs no request.
 */
export async function loadPriceVsMedian(
  regionId: number,
  typeId: number,
  nowMs = Date.now()
): Promise<number | null> {
  try {
    const { points } = await loadPriceHistory(regionId, typeId);
    return priceVsMedianPct(points, nowMs);
  } catch {
    return null;
  }
}
