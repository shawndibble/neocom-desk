import { db } from '@/db';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { factorySchematicId } from '@/engine/pi/colonyPins';
import { loadPiRosterSnapshot, type PiRosterSnapshot } from '@/features/pi/roster';
import {
  loadPlanetName,
  loadSchematicName,
  readCachedPlanetNames,
  readCachedSchematicNames,
} from '@/features/pi/names';
import { loadTypeNames, readCachedTypeNames } from '@/features/character/typeNames';
import type { ColonyStatus } from '@/engine/pi/types';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';

export function mergeNames(
  overlay: ReadonlyMap<number, string>,
  cached: ReadonlyMap<number, string>
): ReadonlyMap<number, string> {
  return overlay.size === 0 ? cached : new Map([...overlay, ...cached]);
}
export const NO_DETAILS: ReadonlyMap<number, StatusResult<CharacterPlanetDetail>> = new Map();
export const EMPTY_STATUS: ColonyStatus = { idle: false, soonestExpiryMs: null };
export const EMPTY_ROSTER: PiRosterSnapshot = {
  colonies: [],
  skipped: [],
  notLoaded: [],
  noColonies: [],
};

export interface ActiveColonies {
  planetsResult: CachedResult<CharacterPlanet[]> | null;
  planetsNeedsReauth: boolean;
  planetsFetchFailed: boolean;
  details: Map<number, StatusResult<CharacterPlanetDetail>>;
  planetNames: Map<number, string>;
  pinTypeNames: Map<number, string>;
  productNames: Map<number, string>;
  schematicNames: Map<number, string>;
  loadedAt: number;
}

export interface Snapshot extends ActiveColonies {
  activeCharacterName: string | null;
  roster: PiRosterSnapshot;
  pi: PiData | null;
}

async function loadActiveColonies(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<ActiveColonies> {
  const {
    cached: planetsResult,
    needsReauth: planetsNeedsReauth,
    fetchFailed,
  } = await loadCharacterPlanets(characterId);
  const planetsFetchFailed = fetchFailed === true;
  const loadedAt = Date.now();
  const planets = planetsResult?.data ?? [];

  const empty: ActiveColonies = {
    planetsResult,
    planetsNeedsReauth,
    planetsFetchFailed,
    details: new Map(),
    planetNames: new Map(),
    pinTypeNames: new Map(),
    productNames: new Map(),
    schematicNames: new Map(),
    loadedAt,
  };
  if (signal.cancelled || planets.length === 0) return empty;

  const [details, planetNameEntries] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      planets.map((planet) => planet.planet_id)
    ),
    Promise.all(planets.map((planet) => loadPlanetName(planet.planet_id))),
  ]);
  const planetNames = new Map<number, string>();
  planets.forEach((planet, i) => {
    const name = planetNameEntries[i];
    if (name) planetNames.set(planet.planet_id, name);
  });

  if (signal.cancelled) return { ...empty, details, planetNames };

  const allPins = [...details.values()].flatMap((result) => result.cached?.data.pins ?? []);
  const pinTypeIds = [...new Set(allPins.map((pin) => pin.type_id))];
  const productTypeIds = [
    ...new Set(
      allPins
        .map((pin) => pin.extractor_details?.product_type_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  const schematicIds = [
    ...new Set(allPins.map(factorySchematicId).filter((id): id is number => id !== undefined)),
  ];

  const [pinTypeNames, productNames, schematicNameEntries] = await Promise.all([
    loadTypeNames(pinTypeIds),
    loadTypeNames(productTypeIds),
    Promise.all(schematicIds.map((id) => loadSchematicName(id))),
  ]);
  const schematicNames = new Map<number, string>();
  schematicIds.forEach((id, i) => {
    const name = schematicNameEntries[i];
    if (name) schematicNames.set(id, name);
  });

  return {
    planetsResult,
    planetsNeedsReauth,
    planetsFetchFailed,
    details,
    planetNames,
    pinTypeNames,
    productNames,
    schematicNames,
    loadedAt,
  };
}

export async function loadPiSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [active, activeCharacterRecord, roster, pi] = await Promise.all([
    loadActiveColonies(characterId, signal),
    db.characters.get(characterId),
    loadPiRosterSnapshot(characterId),
    loadPi().catch(() => null),
  ]);
  const activeCharacterName = activeCharacterRecord?.name ?? null;

  const rosterPins = roster.colonies.flatMap((colony) => colony.detail?.pins ?? []);
  const rosterPinTypeIds = [...new Set(rosterPins.map((pin) => pin.type_id))];
  const rosterProductTypeIds = [
    ...new Set(
      rosterPins
        .map((pin) => pin.extractor_details?.product_type_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  const rosterSchematicIds = [
    ...new Set(rosterPins.map(factorySchematicId).filter((id): id is number => id !== undefined)),
  ];
  const rosterPlanetIds = roster.colonies.map((colony) => colony.planet.planet_id);

  const [rosterPinTypeNames, rosterProductNames, rosterSchematicNames, rosterPlanetNames] =
    await Promise.all([
      readCachedTypeNames(rosterPinTypeIds),
      readCachedTypeNames(rosterProductTypeIds),
      readCachedSchematicNames(rosterSchematicIds),
      readCachedPlanetNames(rosterPlanetIds),
    ]);

  return {
    ...active,
    activeCharacterName,
    pinTypeNames: new Map([...rosterPinTypeNames, ...active.pinTypeNames]),
    productNames: new Map([...rosterProductNames, ...active.productNames]),
    schematicNames: new Map([...rosterSchematicNames, ...active.schematicNames]),
    planetNames: new Map([...rosterPlanetNames, ...active.planetNames]),
    roster,
    pi,
  };
}
