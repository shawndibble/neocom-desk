/**
 * Public, immutable name lookups for PI: `POST /universe/names` has no
 * `planet` category, so planet names must come from the per-planet public
 * GET; schematic names come from the public schematic GET. Both cache under
 * the global sentinel, same shape as `features/character/stations.ts`.
 */
import { getUniversePlanet, getUniverseSchematic } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

// Both are static game data, as this module's name says — a planet does not
// get renamed and a schematic's output does not change between patches.
const STATIC = { staleAfterMs: STALE_AFTER.static };

export async function loadPlanetName(planetId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `planet-info:${planetId}`,
    async () => (await getUniversePlanet(planetId)).data,
    STATIC
  );
  return result?.data.name ?? null;
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
