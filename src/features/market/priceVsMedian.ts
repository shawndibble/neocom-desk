import { priceVsMedianPct } from '@/engine/market/priceVsMedian';
import { loadPriceHistory } from './priceHistory';

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
