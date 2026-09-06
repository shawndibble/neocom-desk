/**
 * Solar-system security status for Assets' station-header badge (issue
 * #148), and solar-system name for the "in space" location label: GET
 * /universe/systems/{id} is public and cacheable (see cache.ts), same shape
 * as `stations.ts`'s station-name lookup. Both readers share one cached
 * fetch per system id.
 */
import { getUniverseSystem, type UniverseSystem } from '@/esi/endpoints';
import { loadWithCache, readCached, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

function cacheKey(systemId: number): string {
  return `system:${systemId}`;
}

async function loadSystem(systemId: number): Promise<UniverseSystem | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(systemId),
    async () => (await getUniverseSystem(systemId)).data,
    // A solar system's name and security status are map constants.
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? null;
}

/** A solar system's security status, or null if unresolvable (offline + uncached). */
export async function loadSystemSecurity(systemId: number): Promise<number | null> {
  return (await loadSystem(systemId))?.security_status ?? null;
}

/**
 * A solar system's security status from cache only — never fetches.
 *
 * For a caller that must not spend ESI just because it noticed a system
 * (an alt's colony system, say): `null` here means "unknown", not "offline",
 * and the caller is expected to have a safe fallback for that.
 */
export async function readCachedSystemSecurity(systemId: number): Promise<number | null> {
  const cached = await readCached<UniverseSystem>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(systemId));
  return cached?.security_status ?? null;
}

/** A solar system's name, or null if unresolvable (offline + uncached). */
export async function loadSystemName(systemId: number): Promise<string | null> {
  return (await loadSystem(systemId))?.name ?? null;
}

export interface SystemNameAndSecurity {
  name: string | null;
  security: number | null;
}

/**
 * Both fields off one cached `/universe/systems/{id}` read, for a caller
 * (Moon Mining's row list) that wants name and security together — calling
 * `loadSystemName` and `loadSystemSecurity` separately per system would be
 * two round trips through `loadWithCache` for what is the same underlying row.
 */
export async function loadSystemNameAndSecurity(systemId: number): Promise<SystemNameAndSecurity> {
  const system = await loadSystem(systemId);
  return { name: system?.name ?? null, security: system?.security_status ?? null };
}

/**
 * Every planet in a system, in ESI's own order — which is orbital order, so
 * the Nth entry is the system's Nth planet (Ashab I, II, III...).
 *
 * This is the only way to learn what a system holds when the character has no
 * colony there: `/characters/{id}/planets` covers owned colonies only. Empty
 * when the system has no planets or could not be resolved; the two are the
 * same answer to a caller that just wants a list.
 *
 * No extra request: the same cached `/universe/systems/{id}` row the security
 * badge already reads carries the planet list.
 */
export async function loadSystemPlanetIds(systemId: number): Promise<number[]> {
  const system = await loadSystem(systemId);
  return system?.planets?.map((planet) => planet.planet_id) ?? [];
}
