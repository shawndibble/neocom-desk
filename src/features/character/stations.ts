/**
 * Station name lookups for Assets grouping: GET /universe/stations/{id} is
 * public and cacheable (see cache.ts). Player structures need an auth scope
 * this app doesn't request (v1 is read-only, station-only per CONTEXT.md);
 * callers show "Structure #id" for those instead of calling this loader.
 */
import { getUniverseStation } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from './cache';

function cacheKey(stationId: number): string {
  return `station:${stationId}`;
}

/** Station name for a stationId, or null if unresolvable (offline + uncached). */
export async function loadStationName(stationId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(stationId),
    async () => (await getUniverseStation(stationId)).data
  );
  return result?.data.name ?? null;
}
