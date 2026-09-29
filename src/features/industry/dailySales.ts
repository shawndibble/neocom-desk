/**
 * How many of a product sell a day, for the market-wide scan's "rarely sold"
 * filter.
 *
 * ESI's market history is per region, and there are ~65 of them — asking
 * every region for every ranked product is thousands of requests a scan. The
 * five trade-hub regions carry nearly all player trade, so their sum stands
 * in for "across all regions". Each region's history is cached until ESI's
 * daily rollover (`loadPriceHistory`), so only the first check a day costs
 * requests.
 */
import { averageDailyVolume } from '@/engine/industry/marketWideSanity';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { EsiError } from '@/esi/errors';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { TRADE_HUBS } from '@/market/hubs';

const HUB_REGION_IDS = [...new Set(TRADE_HUBS.map((hub) => hub.regionId))];

/**
 * Units a day over the last 30 days, summed across the trade-hub regions. A
 * region where the type has no market (ESI 400) sold none; any other failure
 * makes the answer unknown (null) — an under-count would hide a product that
 * does sell.
 */
export async function loadDailySales(typeId: number, nowMs = Date.now()): Promise<number | null> {
  const histories = await Promise.all(
    HUB_REGION_IDS.map((regionId) =>
      loadPriceHistory(regionId, typeId).then(
        (result): readonly MarketHistoryPoint[] | null => result.points,
        (error: unknown) => (error instanceof EsiError && error.status === 400 ? [] : null)
      )
    )
  );
  if (histories.some((history) => history === null)) return null;
  return averageDailyVolume(histories as MarketHistoryPoint[][], nowMs);
}
