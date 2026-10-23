/**
 * Public, immutable name lookups for PI: `POST /universe/names` has no
 * `planet` category, so planet names must come from the per-planet public
 * GET; schematic names come from the public schematic GET. Both cache under
 * the global sentinel, same shape as `features/character/stations.ts`.
 */
import { getUniversePlanet, getUniverseSchematic, type UniversePlanet } from '@/esi/endpoints';
import { loadStaticEntity, readCached, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { loadPi } from '@/sde/loadSde';

// Both are static game data, as this module's name says — a planet does not
// get renamed and a schematic's output does not change between patches.
const PLANET_INFO_PREFIX = 'planet-info';
const SCHEMATIC_PREFIX = 'schematic';

function planetInfoKey(planetId: number): string {
  return `${PLANET_INFO_PREFIX}:${planetId}`;
}

/** A planet's universe row (name, system), cached for good. */
export async function loadPlanetInfoRow(planetId: number): Promise<UniversePlanet | null> {
  const result = await loadStaticEntity(PLANET_INFO_PREFIX, planetId, getUniversePlanet);
  return result?.data ?? null;
}

export async function loadPlanetName(planetId: number): Promise<string | null> {
  return (await loadPlanetInfoRow(planetId))?.name ?? null;
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
  return `${SCHEMATIC_PREFIX}:${schematicId}`;
}

/**
 * Schematic names from the precached `pi.json`, keyed by ESI schematic id.
 * Works offline and on a device that has never called ESI. Empty on any
 * load failure, so the ESI path stays the fallback.
 */
const localNamesByPi = new WeakMap<object, Map<number, string>>();

async function localSchematicNames(): Promise<Map<number, string>> {
  try {
    const pi = await loadPi();
    let names = localNamesByPi.get(pi);
    if (!names) {
      names = new Map();
      for (const schematic of Object.values(pi.schematics)) {
        names.set(schematic.schematicId, schematic.name);
      }
      localNamesByPi.set(pi, names);
    }
    return names;
  } catch {
    // Local data unavailable: the caller falls back to ESI, which reports its own failure.
    return new Map();
  }
}

/** Local `pi.json` first (offline-safe), ESI only for an id it does not list. */
export async function loadSchematicName(schematicId: number): Promise<string | null> {
  const local = (await localSchematicNames()).get(schematicId);
  if (local) return local;
  const result = await loadStaticEntity(SCHEMATIC_PREFIX, schematicId, getUniverseSchematic);
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
  const local = await localSchematicNames();
  await Promise.all(
    unique.map(async (schematicId) => {
      const bundled = local.get(schematicId);
      if (bundled) {
        names.set(schematicId, bundled);
        return;
      }
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
