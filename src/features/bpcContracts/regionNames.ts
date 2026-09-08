/**
 * Region name lookups for the public BPC contract search (issue #608). GET
 * /universe/regions/{id} is public and cacheable, same trade as
 * `character/stations.ts`'s station lookup — a region's name never changes.
 */
import { getUniverseRegion } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

function cacheKey(regionId: number): string {
  return `bpc-region:${regionId}`;
}

/** Region name for a regionId, or null if unresolvable (offline + uncached). */
export async function loadRegionName(regionId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(regionId),
    async () => (await getUniverseRegion(regionId)).data,
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data?.name ?? null;
}
