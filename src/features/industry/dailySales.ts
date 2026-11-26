import { averageDailyVolume } from '@/engine/industry/marketWideSanity';
import { EsiError } from '@/esi/errors';
import { loadLpStoreVolume, type LpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { MINUTE_MS } from '@/lib/age';

const VOLUME_TTL_MS = 30 * MINUTE_MS;
const volumeCache = new Map<number, { at: number; promise: Promise<LpStoreVolume | null> }>();

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

export function resetRegionVolumes(): void {
  volumeCache.clear();
}

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
