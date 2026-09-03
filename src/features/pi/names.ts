/**
 * Public, immutable name lookups for PI: `POST /universe/names` has no
 * `planet` category, so planet names must come from the per-planet public
 * GET; schematic names come from the public schematic GET. Both cache under
 * the global sentinel, same shape as `features/character/stations.ts`.
 */
import { getUniversePlanet, getUniverseSchematic } from '@/esi/endpoints';
import { loadWithCache, readCached, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

// Both are static game data, as this module's name says — a planet does not
// get renamed and a schematic's output does not change between patches.
const STATIC = { staleAfterMs: STALE_AFTER.static };

function planetInfoKey(planetId: number): string {
  return `planet-info:${planetId}`;
}

export async function loadPlanetName(planetId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    planetInfoKey(planetId),
    async () => (await getUniversePlanet(planetId)).data,
    STATIC
  );
  return result?.data.name ?? null;
}

/**
 * Planet names from Dexie only — never a fetch. `loadPlanetName` is one live
 * GET per planet on a cache miss; the cross-character timeline reads every
 * Character's colonies on page open, so resolving names through it would
 * re-introduce the fan-out the timeline exists to avoid. An unresolved id is
 * simply absent, and the caller falls back to its own "Planet #id" label.
 */
export async function readCachedPlanetNames(
  planetIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(planetIds)];
  const names = new Map<number, string>();
  await Promise.all(
    unique.map(async (planetId) => {
      const info = await readCached<{ name?: string }>(
        GLOBAL_CACHE_CHARACTER_ID,
        planetInfoKey(planetId)
      );
      if (info?.name) names.set(planetId, info.name);
    })
  );
  return names;
}

export async function loadSchematicName(schematicId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `schematic:${schematicId}`,
    async () => (await getUniverseSchematic(schematicId)).data,
    STATIC
  );
  return result?.data.schematic_name ?? null;
}
