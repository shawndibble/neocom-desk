/**
 * Station name lookups for Assets grouping: GET /universe/stations/{id} is
 * public and cacheable (see cache.ts). Player structures are a different
 * endpoint with a different auth shape (ACL-checked, not merely
 * scope-gated) — see `structures.ts`'s `loadStructureName`.
 */
import { getUniverseStation, type UniverseStation } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

function cacheKey(stationId: number): string {
  return `station:${stationId}`;
}

async function loadStation(stationId: number): Promise<UniverseStation | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(stationId),
    async () => (await getUniverseStation(stationId)).data,
    // An NPC station's name and system do not change.
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? null;
}

/** Station name for a stationId, or null if unresolvable (offline + uncached). */
export async function loadStationName(stationId: number): Promise<string | null> {
  return (await loadStation(stationId))?.name ?? null;
}

/** Station's solar system id, for jumps-away distances (issue #87), or null if unresolvable. */
export async function loadStationSystemId(stationId: number): Promise<number | null> {
  return (await loadStation(stationId))?.system_id ?? null;
}

/** The same three fields `loadStructureSummary` returns, for an NPC station. */
export async function loadStationSummary(
  stationId: number
): Promise<{ name: string; systemId: number; typeId: number } | null> {
  const station = await loadStation(stationId);
  return station
    ? { name: station.name, systemId: station.system_id, typeId: station.type_id }
    : null;
}
