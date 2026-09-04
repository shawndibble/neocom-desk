/**
 * Every OTHER authenticated Character's colonies, cache-only — the data
 * behind the Colonies panel's "Show alt colonies" toggle. A composition
 * layer, not new infrastructure — same shape as `features/character/roster.ts`:
 * nothing here talks to ESI, it reads the rows the per-character read-through
 * loaders in `./data` already write (docs/ARCHITECTURE.md §7 step 3: never
 * reimplement read-through).
 *
 * **Cache-only, deliberately.** `loadAllColonyDetails` is one live call per
 * planet at concurrency 3 on the shared `char-industry` bucket. Multiplying
 * that by every authenticated Character on page open would be a rate-limit
 * problem for a toggle that is glanceable, not authoritative — so page open
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
 * The active Character is excluded (by `activeCharacterId`, not filtered by
 * the caller): its own colonies already come from the route's live load, so
 * a cache-only copy here would at best duplicate that and at worst show a
 * staler version beside it.
 *
 * Four other-Character outcomes are kept apart because they are four
 * different facts, and a panel that renders them alike is lying about one of
 * them: `skipped` (no scope), `notLoaded` (scope, but nothing cached yet),
 * `noColonies` (a cached list that is genuinely empty), and colonies (listed,
 * with or without cached pin detail — `detail` is `null` rather than the
 * colony being dropped when detail isn't cached, so a character with
 * colonies but no detail yet still shows up instead of reading as having
 * none). Pure of `Date.now()`: ordering and expiry live at the display seam.
 */
import { db, type CharacterRecord } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { readCachedRows } from '@/esi/cache';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import { KEYS, readCachedColonyDetails } from './data';

const PLANETS_SCOPE = ESI_REGISTRY.getCharacterPlanets.scope;

/** Just enough to name a Character in a "skipped"/"not loaded yet" line. */
export interface RosterCharacter {
  characterId: number;
  name: string;
}

/** One other Character's colony, for the alt-colonies toggle. */
export interface RosterColony {
  characterId: number;
  characterName: string;
  planet: CharacterPlanet;
  /** Null when this colony's pin detail isn't cached yet — listed, but unknown. */
  detail: CharacterPlanetDetail | null;
}

export interface PiRosterSnapshot {
  colonies: RosterColony[];
  /** Token lacks the planets scope. Never read, never fetched, never a 403. */
  skipped: RosterCharacter[];
  /** Scope granted, but no colony list cached yet — unknown, not empty. */
  notLoaded: RosterCharacter[];
  /** A cached colony list that really is empty. */
  noColonies: RosterCharacter[];
}

const EMPTY_SNAPSHOT: PiRosterSnapshot = {
  colonies: [],
  skipped: [],
  notLoaded: [],
  noColonies: [],
};

function ref({ characterId, name }: CharacterRecord): RosterCharacter {
  return { characterId, name };
}

export async function loadPiRosterSnapshot(activeCharacterId: number): Promise<PiRosterSnapshot> {
  const characters = (await db.characters.toArray()).filter(
    (character) => character.characterId !== activeCharacterId
  );
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

  const colonies: RosterColony[] = [];
  await Promise.all(
    withColonies.map(async ({ character, planets }) => {
      const details = await readCachedColonyDetails(
        character.characterId,
        planets.map((planet) => planet.planet_id)
      );
      for (const planet of planets) {
        colonies.push({
          characterId: character.characterId,
          characterName: character.name,
          planet,
          detail: details.get(planet.planet_id)?.data ?? null,
        });
      }
    })
  );

  return { colonies, skipped, notLoaded, noColonies };
}
