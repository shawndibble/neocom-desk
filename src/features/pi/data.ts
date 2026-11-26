import {
  getCharacterPlanets,
  getCharacterPlanet,
  type CharacterPlanet,
  type CharacterPlanetDetail,
} from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import {
  conditionalFetch,
  loadWithCacheStatus,
  readCachedRows,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';

const LIST_KEY = 'planets';
const DETAIL_CONCURRENCY = 3;

function detailKey(planetId: number): string {
  return `planet:${planetId}`;
}

export const KEYS = { planets: LIST_KEY, planetDetail: detailKey } as const;

const PLANETS_AUTH_POLICY = {
  detectAuthFailure: (err: unknown) => err instanceof EsiError && err.status === 403,
  skipCacheOnAuthFailure: true,
};

export function loadCharacterPlanets(
  characterId: number
): Promise<StatusResult<CharacterPlanet[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterPlanets(characterId, options)
  );
  return loadWithCacheStatus(characterId, LIST_KEY, fetchLive, {
    ...PLANETS_AUTH_POLICY,
    conditional,
    reportFetchFailure: true,
    authFailureEndpoint: 'getCharacterPlanets',
  });
}

export function loadPlanetDetail(
  characterId: number,
  planetId: number
): Promise<StatusResult<CharacterPlanetDetail>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterPlanet(characterId, planetId, options)
  );
  return loadWithCacheStatus(characterId, detailKey(planetId), fetchLive, {
    ...PLANETS_AUTH_POLICY,
    conditional,
  });
}

export async function readCachedColonyDetails(
  characterId: number,
  planetIds: readonly number[]
): Promise<Map<number, CachedResult<CharacterPlanetDetail>>> {
  const found = new Map<number, CachedResult<CharacterPlanetDetail>>();
  await Promise.all(
    planetIds.map(async (planetId) => {
      const row = (
        await readCachedRows<CharacterPlanetDetail>([characterId], detailKey(planetId))
      ).get(characterId);
      if (row) found.set(planetId, row);
    })
  );
  return found;
}

export async function loadAllColonyDetails(
  characterId: number,
  planetIds: readonly number[]
): Promise<Map<number, StatusResult<CharacterPlanetDetail>>> {
  const results = new Map<number, StatusResult<CharacterPlanetDetail>>();
  await mapWithConcurrencyLimit(planetIds, DETAIL_CONCURRENCY, async (planetId) => {
    results.set(planetId, await loadPlanetDetail(characterId, planetId));
  });
  return results;
}
