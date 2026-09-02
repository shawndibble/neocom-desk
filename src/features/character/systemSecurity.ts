/**
 * Solar-system security status for Assets' station-header badge (issue
 * #148): GET /universe/systems/{id} is public and cacheable (see cache.ts),
 * same shape as `stations.ts`'s station-name lookup.
 */
import { getUniverseSystem } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';

function cacheKey(systemId: number): string {
  return `system:${systemId}`;
}

/** A solar system's security status, or null if unresolvable (offline + uncached). */
export async function loadSystemSecurity(systemId: number): Promise<number | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(systemId),
    async () => (await getUniverseSystem(systemId)).data
  );
  return result?.data?.security_status ?? null;
}
