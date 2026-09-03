/**
 * Every authenticated Character's extractor programs in one list, for the
 * cross-character timeline. A composition layer, not new infrastructure —
 * same shape as `features/character/roster.ts`: nothing here talks to ESI, it
 * reads the rows the per-character read-through loaders in `./data` already
 * write (docs/ARCHITECTURE.md §7 step 3: never reimplement read-through).
 *
 * **Cache-only, deliberately.** `loadAllColonyDetails` is one live call per
 * planet at concurrency 3 on the shared `char-industry` bucket. Multiplying
 * that by every authenticated Character on page open would be a rate-limit
 * problem for a panel that is glanceable, not authoritative — so page open
 * costs zero ESI calls here and the active Character's live load (already
 * done by the route) is what keeps its own rows fresh. An explicit Refresh
 * re-runs that live load; this still only reads what it left behind.
 *
 * **The planets scope is checked up front, per Character, before any read.**
 * That is the trap `features/character/assets.ts` documents at
 * `loadAllCharactersAssets`: a live 403 is an auth failure, so it raises the
 * app-wide re-auth banner naming an alt the player never asked about, and
 * nothing caches it, so the same Character trips it again every visit.
 * Characters without the scope go in `skipped` and are never read or fetched.
 *
 * Four Character outcomes are kept apart because they are four different
 * facts, and a panel that renders them alike is lying about one of them:
 * `skipped` (no scope), `notLoaded` (scope, but nothing cached yet),
 * `noColonies` (a cached list that is genuinely empty), and contributing
 * programs. Pure of `Date.now()`: ordering and expiry live at the display
 * seam, which already carries the loader's `loadedAt`.
 */
import { db, type CharacterRecord } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { readCachedRows } from '@/esi/cache';
import type { CharacterPlanet } from '@/esi/endpoints';
import type { ExtractorProgram } from '@/engine/pi/types';
import { readCachedTypeNames } from '@/features/character/typeNames';
import { extractorProgramsFromPins } from './adapters';
import { KEYS, readCachedColonyDetails } from './data';
import { readCachedPlanetNames } from './names';

const PLANETS_SCOPE = ESI_REGISTRY.getCharacterPlanets.scope;

/** Just enough to name a Character in a "skipped"/"not loaded yet" line. */
export interface RosterCharacter {
  characterId: number;
  name: string;
}

/** One extractor program, carrying the identity needed to act on it. */
export interface TimelineProgram {
  characterId: number;
  characterName: string;
  planetId: number;
  solarSystemId: number;
  /** Null when the public planet lookup isn't cached — never a fetch to fill it. */
  planetName: string | null;
  /** Null when the extractor declares no product, or its name isn't cached. */
  productName: string | null;
  program: ExtractorProgram;
}

export interface PiRosterSnapshot {
  programs: TimelineProgram[];
  /** Colonies whose pins were readable, across every Character. */
  colonyCount: number;
  /**
   * Colonies listed but whose pin detail isn't cached: their programs are
   * unknown, so a count taken from `programs` alone is a lower bound.
   */
  coloniesWithoutDetail: number;
  /** Token lacks the planets scope. Never read, never fetched, never a 403. */
  skipped: RosterCharacter[];
  /** Scope granted, but no colony list cached yet — unknown, not empty. */
  notLoaded: RosterCharacter[];
  /** A cached colony list that really is empty. */
  noColonies: RosterCharacter[];
}

const EMPTY_SNAPSHOT: PiRosterSnapshot = {
  programs: [],
  colonyCount: 0,
  coloniesWithoutDetail: 0,
  skipped: [],
  notLoaded: [],
  noColonies: [],
};

function ref({ characterId, name }: CharacterRecord): RosterCharacter {
  return { characterId, name };
}

/** One colony's readable pins, flattened to programs with their identity attached. */
interface ColonyPins {
  character: CharacterRecord;
  planet: CharacterPlanet;
  programs: ExtractorProgram[];
  productTypeIdByPin: Map<number, number>;
}

export async function loadPiRosterSnapshot(): Promise<PiRosterSnapshot> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return EMPTY_SNAPSHOT;

  const granted = await Promise.all(
    characters.map(async (character) => {
      const token = await db.tokens.get(character.characterId);
      return (token?.scopes ?? []).includes(PLANETS_SCOPE);
    })
  );
  const skipped = characters.filter((_, i) => !granted[i]).map(ref);
  const scoped = characters.filter((_, i) => granted[i]);

  const lists = await readCachedRows<CharacterPlanet[]>(
    scoped.map((character) => character.characterId),
    KEYS.planets
  );

  const notLoaded: RosterCharacter[] = [];
  const noColonies: RosterCharacter[] = [];
  const withColonies: { character: CharacterRecord; planets: CharacterPlanet[] }[] = [];
  for (const character of scoped) {
    const planets = lists.get(character.characterId)?.data;
    // Absent row vs. empty array: "we have never read this Character's
    // colonies" is not the same claim as "this Character has none".
    if (planets === undefined) notLoaded.push(ref(character));
    else if (planets.length === 0) noColonies.push(ref(character));
    else withColonies.push({ character, planets });
  }

  let coloniesWithoutDetail = 0;
  const colonies: ColonyPins[] = [];
  await Promise.all(
    withColonies.map(async ({ character, planets }) => {
      const details = await readCachedColonyDetails(
        character.characterId,
        planets.map((planet) => planet.planet_id)
      );
      for (const planet of planets) {
        const detail = details.get(planet.planet_id)?.data;
        if (!detail) {
          coloniesWithoutDetail += 1;
          continue;
        }
        const productTypeIdByPin = new Map<number, number>();
        for (const pin of detail.pins) {
          const productTypeId = pin.extractor_details?.product_type_id;
          if (productTypeId !== undefined) productTypeIdByPin.set(pin.pin_id, productTypeId);
        }
        colonies.push({
          character,
          planet,
          programs: extractorProgramsFromPins(detail.pins),
          productTypeIdByPin,
        });
      }
    })
  );

  const [planetNames, productNames] = await Promise.all([
    readCachedPlanetNames(colonies.map((colony) => colony.planet.planet_id)),
    readCachedTypeNames(colonies.flatMap((colony) => [...colony.productTypeIdByPin.values()])),
  ]);

  const programs = colonies.flatMap(({ character, planet, programs, productTypeIdByPin }) =>
    programs.map((program): TimelineProgram => {
      const productTypeId = productTypeIdByPin.get(program.pinId);
      return {
        characterId: character.characterId,
        characterName: character.name,
        planetId: planet.planet_id,
        solarSystemId: planet.solar_system_id,
        planetName: planetNames.get(planet.planet_id) ?? null,
        productName: productTypeId === undefined ? null : (productNames.get(productTypeId) ?? null),
        program,
      };
    })
  );

  return {
    programs,
    colonyCount: colonies.length,
    coloniesWithoutDetail,
    skipped,
    notLoaded,
    noColonies,
  };
}
