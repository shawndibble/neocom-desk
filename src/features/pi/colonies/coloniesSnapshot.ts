import { db } from '@/db';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { factorySchematicId } from '@/features/pi/adapters';
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

/**
 * The Colonies tab's reads: the active Character's colonies live, every other
 * Character's from Dexie, and the names both need. One loader, so the route's
 * header (data age, refresh) and the tab read the same snapshot.
 */

export const NO_NAMES: ReadonlyMap<number, string> = new Map();

/** `cached` wins on a shared id — it's always the fresher read (see call sites); `overlay` only fills what it left unresolved. */
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
  /** 403 (scope never granted) means "log in again", not "offline". */
  planetsNeedsReauth: boolean;
  /** ESI did not answer and nothing is cached: an error, not "no colonies". */
  planetsFetchFailed: boolean;
  details: Map<number, StatusResult<CharacterPlanetDetail>>;
  planetNames: Map<number, string>;
  pinTypeNames: Map<number, string>;
  productNames: Map<number, string>;
  schematicNames: Map<number, string>;
  /** Captured in the loader, not at render: Date.now() is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

export interface Snapshot extends ActiveColonies {
  /** Null when the active Character record itself isn't cached (shouldn't happen post-login, but the type is honest about it). */
  activeCharacterName: string | null;
  /** Every OTHER Character's colonies, read cache-only — see `features/pi/roster.ts`. */
  roster: PiRosterSnapshot;
  /** For each row's "Storage full in" figure. Null on a failed load — that figure is optional, so it must not take the rest of the tab down. */
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

/**
 * The active Character's colonies live, then every other Character's
 * colonies from Dexie, for the alt-colonies toggle.
 *
 * The cache-only story is the whole reason page open costs exactly the ESI
 * traffic it cost before this toggle existed: `loadPiRosterSnapshot` never
 * fetches, so resolving *its* colonies' pin/product/schematic/planet names
 * must stay cache-only too (`readCached*`, never `load*`) — otherwise a
 * character with several alts would turn every page open into a name-lookup
 * fan-out for colonies nobody asked to see yet. Roster names are spread
 * first and the active Character's live-resolved ones last, so a same-id
 * collision (there won't usually be one — this is static game data) resolves
 * to the fresher live read.
 *
 * That cache-only rule is specifically about *this function* running
 * unconditionally on every page open — it says nothing about the
 * alt-colonies toggle itself. A separate `useEffect` further down in this
 * component *does* call `loadPlanetName`/`loadTypeNames` for names still
 * missing after the read above, batched and gated on the toggle being on, so
 * that a pilot who actually opens the alt view gets resolved names instead
 * of raw ids without paying the fan-out cost on every visit.
 */
export async function loadPiSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [active, activeCharacterRecord, roster, pi] = await Promise.all([
    loadActiveColonies(characterId, signal),
    db.characters.get(characterId),
    loadPiRosterSnapshot(characterId),
    // Cached after first load, so this is free beyond what the Advisor tab
    // already pays. Caught, not awaited bare: an optional figure must not
    // take the rest of the tab's real colony data down with it.
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
