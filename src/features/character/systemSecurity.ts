/**
 * Solar-system security status for Assets' station-header badge (issue
 * #148), and solar-system name for the "in space" location label: GET
 * /universe/systems/{id} is public and cacheable (see cache.ts), same shape
 * as `stations.ts`'s station-name lookup. Both readers share one cached
 * fetch per system id.
 */
import { getUniverseSystem, type UniverseSystem } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';

function cacheKey(systemId: number): string {
  return `system:${systemId}`;
}

async function loadSystem(systemId: number): Promise<UniverseSystem | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(systemId),
    async () => (await getUniverseSystem(systemId)).data
  );
  return result?.data ?? null;
}

/** A solar system's security status, or null if unresolvable (offline + uncached). */
export async function loadSystemSecurity(systemId: number): Promise<number | null> {
  return (await loadSystem(systemId))?.security_status ?? null;
}

/** A solar system's name, or null if unresolvable (offline + uncached). */
export async function loadSystemName(systemId: number): Promise<string | null> {
  return (await loadSystem(systemId))?.name ?? null;
}
