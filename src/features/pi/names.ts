/**
 * Public, immutable name lookups for PI: `POST /universe/names` has no
 * `planet` category, so planet names must come from the per-planet public
 * GET; schematic names come from the public schematic GET. Both cache under
 * the global sentinel, same shape as `features/character/stations.ts`.
 */
import { getUniversePlanet, getUniverseSchematic } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';

export async function loadPlanetName(planetId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `planet-info:${planetId}`,
    async () => (await getUniversePlanet(planetId)).data
  );
  return result?.data.name ?? null;
}

export async function loadSchematicName(schematicId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `schematic:${schematicId}`,
    async () => (await getUniverseSchematic(schematicId)).data
  );
  return result?.data.schematic_name ?? null;
}
