/**
 * How many of a product sell a day, for the market-wide scan's "rarely sold"
 * filter and ISK/day.
 *
 * ESI's market history is per region, and there are ~65 of them — asking
 * every region for every ranked product is thousands of requests a scan. The
 * five trade-hub regions carry nearly all player trade, so their sum stands
 * in for "across all regions".
 *
 * Each hub region's units a day for every traded type is one small object the
 * daily `public-data-lp-store` job publishes (`loadLpStoreVolume`), so a scan
 * is five fetches rather than five per product. A region whose object can't
 * be read falls back to ESI's history for that region (`loadPriceHistory`,
 * cached until ESI's daily rollover).
 */
import { averageDailyVolume } from '@/engine/industry/marketWideSanity';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { EsiError } from '@/esi/errors';
import { loadLpStoreVolume, type LpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { TRADE_HUBS } from '@/market/hubs';

const HUB_REGION_IDS = [...new Set(TRADE_HUBS.map((hub) => hub.regionId))];

/** How long one read of the five volume objects is reused, across products and across rescans. */
const VOLUMES_TTL_MS = 30 * 60_000;
let volumesRead: { at: number; promise: Promise<(LpStoreVolume | null)[]> } | null = null;

/** The hub regions' volume objects (null where one is unavailable), shared by a scan's products. */
function loadHubVolumes(now: number): Promise<(LpStoreVolume | null)[]> {
  if (!volumesRead || now - volumesRead.at > VOLUMES_TTL_MS) {
    volumesRead = {
      at: now,
      promise: Promise.all(HUB_REGION_IDS.map((regionId) => loadLpStoreVolume(regionId))),
    };
  }
  return volumesRead.promise;
}

/** Test seam: forget the shared volume read. */
export function resetHubVolumes(): void {
  volumesRead = null;
}

/**
 * Units a day over the last 30 days, summed across the trade-hub regions. A
 * type absent from a region's volume object sold none there; a region where
 * ESI says the type has no market (400) sold none; any other failure makes the
 * answer unknown (null) — an under-count would hide a product that does sell.
 */
export async function loadDailySales(typeId: number, nowMs = Date.now()): Promise<number | null> {
  const volumes = await loadHubVolumes(nowMs);
  let perDay = 0;
  const unread: number[] = [];
  volumes.forEach((volume, index) => {
    if (volume) perDay += volume[typeId] ?? 0;
    else unread.push(HUB_REGION_IDS[index]);
  });
  if (unread.length === 0) return perDay;
  const histories = await Promise.all(
    unread.map((regionId) =>
      loadPriceHistory(regionId, typeId).then(
        (result): readonly MarketHistoryPoint[] | null => result.points,
        (error: unknown) => (error instanceof EsiError && error.status === 400 ? [] : null)
      )
    )
  );
  if (histories.some((history) => history === null)) return null;
  return perDay + averageDailyVolume(histories as MarketHistoryPoint[][], nowMs);
}
