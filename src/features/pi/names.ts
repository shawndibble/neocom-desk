import { getUniversePlanet, getUniverseSchematic, type UniversePlanet } from '@/esi/endpoints';
import { loadStaticEntity, readCached, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { loadPi } from '@/sde/loadSde';

const PLANET_INFO_PREFIX = 'planet-info';
const SCHEMATIC_PREFIX = 'schematic';

function planetInfoKey(planetId: number): string {
  return `${PLANET_INFO_PREFIX}:${planetId}`;
}

export async function loadPlanetInfoRow(planetId: number): Promise<UniversePlanet | null> {
  const result = await loadStaticEntity(PLANET_INFO_PREFIX, planetId, getUniversePlanet);
  return result?.data ?? null;
}

export async function loadPlanetName(planetId: number): Promise<string | null> {
  return (await loadPlanetInfoRow(planetId))?.name ?? null;
}

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
    return new Map();
  }
}

export async function loadSchematicName(schematicId: number): Promise<string | null> {
  const local = (await localSchematicNames()).get(schematicId);
  if (local) return local;
  const result = await loadStaticEntity(SCHEMATIC_PREFIX, schematicId, getUniverseSchematic);
  return result?.data.schematic_name ?? null;
}

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
      const info = await readCached<{ schematic_name?: string }>(
        GLOBAL_CACHE_CHARACTER_ID,
        schematicKey(schematicId)
      );
      if (info?.schematic_name) names.set(schematicId, info.schematic_name);
    })
  );
  return names;
}
