import { db, type CharacterRecord } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { readCachedRows } from '@/esi/cache';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import { KEYS, readCachedColonyDetails } from './data';

const PLANETS_SCOPE = ESI_REGISTRY.getCharacterPlanets.scope;

export interface RosterCharacter {
  characterId: number;
  name: string;
}

export interface RosterColony {
  characterId: number;
  characterName: string;
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  oldestFetchedAt: Date;
}

export interface PiRosterSnapshot {
  colonies: RosterColony[];
  skipped: RosterCharacter[];
  notLoaded: RosterCharacter[];
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
  const withColonies: {
    character: CharacterRecord;
    planets: CharacterPlanet[];
    listFetchedAt: Date;
  }[] = [];
  for (const character of scoped) {
    const list = lists.get(character.characterId);
    if (list === undefined) notLoaded.push(ref(character));
    else if (list.data.length === 0) noColonies.push(ref(character));
    else withColonies.push({ character, planets: list.data, listFetchedAt: list.fetchedAt });
  }

  const colonies: RosterColony[] = [];
  await Promise.all(
    withColonies.map(async ({ character, planets, listFetchedAt }) => {
      const details = await readCachedColonyDetails(
        character.characterId,
        planets.map((planet) => planet.planet_id)
      );
      const oldestFetchedAt = new Date(
        Math.min(
          listFetchedAt.getTime(),
          ...[...details.values()].map((row) => row.fetchedAt.getTime())
        )
      );
      for (const planet of planets) {
        colonies.push({
          characterId: character.characterId,
          characterName: character.name,
          planet,
          detail: details.get(planet.planet_id)?.data ?? null,
          oldestFetchedAt,
        });
      }
    })
  );

  return { colonies, skipped, notLoaded, noColonies };
}
