/**
 * Station name lookups for Assets grouping: GET /universe/stations/{id} is
 * public and cacheable (see cache.ts). Player structures are a different
 * endpoint with a different auth shape (ACL-checked, not merely
 * scope-gated) — see `structures.ts`'s `loadStructureName`.
 */
import { getUniverseStation } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';

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
