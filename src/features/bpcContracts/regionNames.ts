/**
 * Region name lookups for the public BPC contract search (issue #608). GET
 * /universe/regions/{id} is public and cacheable, same trade as
 * `character/stations.ts`'s station lookup — a region's name never changes.
 */
import { getUniverseRegion } from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';

function cacheKey(regionId: number): string {
  return `bpc-region:${regionId}`;
}

/** Region name for a regionId, or null if unresolvable (offline + uncached). */
export async function loadRegionName(regionId: number): Promise<string | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getUniverseRegion(regionId, options)
  );
  const result = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, cacheKey(regionId), fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
  return result?.data?.name ?? null;
}
