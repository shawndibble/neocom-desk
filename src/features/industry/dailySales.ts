/**
 * How many of a product sell a day in the scanned hub's region, for the
 * market-wide scan's "rarely sold" filter and ISK/day. The scan prices at one
 * hub, so it is that hub's sales that bound what a builder can sell there —
 * not the five trade hubs added together.
 *
 * The region's units a day for every traded type is one small object the
 * daily `public-data-lp-store` job publishes (`loadLpStoreVolume`), so a scan
 * is one fetch rather than one per product. A region whose object can't be
 * read falls back to ESI's history for that product (`loadPriceHistory`,
 * cached until ESI's daily rollover).
 */
import { averageDailyVolume } from '@/engine/industry/marketWideSanity';
import { EsiError } from '@/esi/errors';
import { loadLpStoreVolume, type LpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { MINUTE_MS } from '@/lib/age';

/** How long one complete read of a region's volume object is reused, across products and rescans. */
const VOLUME_TTL_MS = 30 * MINUTE_MS;
const volumeCache = new Map<number, { at: number; promise: Promise<LpStoreVolume | null> }>();

/**
 * The region's volume object (null where unavailable), shared by a scan's
 * products. Only a read that loaded is kept: a transient failure must not pin
 * the region to the per-product ESI fallback for the TTL.
 */
function loadRegionVolume(regionId: number): Promise<LpStoreVolume | null> {
  const now = Date.now();
  const cached = volumeCache.get(regionId);
  if (cached && now - cached.at <= VOLUME_TTL_MS) return cached.promise;
  const entry = { at: now, promise: loadLpStoreVolume(regionId) };
  volumeCache.set(regionId, entry);
  void entry.promise.then((volume) => {
    if (volume === null && volumeCache.get(regionId) === entry) volumeCache.delete(regionId);
  });
  return entry.promise;
}

/** Test seam: forget the shared volume reads. */
export function resetRegionVolumes(): void {
  volumeCache.clear();
}

/**
 * Units a day in `regionId` over about the last 30 days (the region's volume
 * object, else ESI's last 30 days). A type absent from the object sold none; a
 * type ESI says has no market (400) sold none; any other failure makes the
 * answer unknown (null) — an under-count would hide a product that does sell.
 */
export async function loadDailySales(
  regionId: number,
  typeId: number,
  nowMs = Date.now()
): Promise<number | null> {
  const volume = await loadRegionVolume(regionId);
  if (volume) return volume[typeId] ?? 0;
  try {
    return averageDailyVolume([(await loadPriceHistory(regionId, typeId)).points], nowMs);
  } catch (error) {
    return error instanceof EsiError && error.status === 400 ? 0 : null;
  }
}
