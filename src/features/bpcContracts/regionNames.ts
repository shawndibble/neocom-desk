/**
 * Region name lookups for the public BPC contract search (issue #608). GET
 * /universe/regions/{id} is public and cacheable, same trade as
 * `character/stations.ts`'s station lookup — a region's name never changes.
 */
import { getUniverseRegion } from '@/esi/endpoints';
import { loadStaticEntity } from '@/esi/cache';

/** Region name for a regionId, or null if unresolvable (offline + uncached). */
export async function loadRegionName(regionId: number): Promise<string | null> {
  const result = await loadStaticEntity('bpc-region', regionId, getUniverseRegion);
  return result?.data?.name ?? null;
}
