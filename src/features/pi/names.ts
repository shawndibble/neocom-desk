/**
 * Public, immutable name lookups for PI: `POST /universe/names` has no
 * `planet` category, so planet names must come from the per-planet public
 * GET; schematic names come from the public schematic GET. Both cache under
 * the global sentinel, same shape as `features/character/stations.ts`.
 */
import { getUniversePlanet, getUniverseSchematic, type UniversePlanet } from '@/esi/endpoints';
import { loadWithCache, readCached, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';

// Both are static game data, as this module's name says — a planet does not
// get renamed and a schematic's output does not change between patches.
const STATIC = { staleAfterMs: STALE_AFTER.static };

function planetInfoKey(planetId: number): string {
  return `planet-info:${planetId}`;
}

async function loadPlanetInfoRow(planetId: number): Promise<UniversePlanet | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    planetInfoKey(planetId),
    async () => (await getUniversePlanet(planetId)).data,
    STATIC
  );
  return result?.data ?? null;
}

export async function loadPlanetName(planetId: number): Promise<string | null> {
  return (await loadPlanetInfoRow(planetId))?.name ?? null;
}

/**
 * A planet's name and its own typeID, which
 * `PiData.planetTypeByTypeId` turns into the same `PlanetType` string an
 * owned colony reports. The Advisor needs both for a planet in the system
 * that the character has *no* colony on, where `/characters/{id}/planets`
 * says nothing at all.
 *
 * Shares the cached row `loadPlanetName` already reads, so a planet whose
 * name is on screen costs no second request to type.
 */
export async function loadPlanetInfo(
  planetId: number
): Promise<{ name: string; typeId: number } | null> {
  const info = await loadPlanetInfoRow(planetId);
  return info ? { name: info.name, typeId: info.type_id } : null;
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

function schematicKey(schematicId: number): string {
  return `schematic:${schematicId}`;
}

export async function loadSchematicName(schematicId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    schematicKey(schematicId),
    async () => (await getUniverseSchematic(schematicId)).data,
    STATIC
  );
  return result?.data.schematic_name ?? null;
}

/**
 * Schematic names from `esiCache` only — never a fetch. Same rationale as
 * `readCachedPlanetNames`: for a fan-out over colonies this page never fetched
 * (the alt-colonies toggle), resolving through `loadSchematicName` would turn
 * a display-only read into one live call per unresolved schematic. An
 * unresolved id is simply absent, and the caller falls back to its own
 * "Unknown schematic" label.
 */
export async function readCachedSchematicNames(
  schematicIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(schematicIds)];
  const names = new Map<number, string>();
  await Promise.all(
    unique.map(async (schematicId) => {
      // `loadWithCache` stores the full ESI schematic object, not a bare
      // string — same shape `loadSchematicName` reads `.schematic_name` off.
      const info = await readCached<{ schematic_name?: string }>(
        GLOBAL_CACHE_CHARACTER_ID,
        schematicKey(schematicId)
      );
      if (info?.schematic_name) names.set(schematicId, info.schematic_name);
    })
  );
  return names;
}
