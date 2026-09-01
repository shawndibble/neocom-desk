/**
 * Fetch + cache layer for planetary colonies: the character-owned colony
 * list and per-colony detail (extractor/factory pins).
 *
 * `esi-planets.manage_planets.v1` was added after some characters already
 * logged in (same situation as `esi-industry.read_character_jobs.v1` —
 * `features/industry/jobs.ts`), so a character that never granted it has
 * never cached a response: only a 403 counts as reauth, and there is no
 * cache fallback to skip to.
 *
 * Colony detail is one call per planet on the `char-industry` rate-limit
 * bucket, shared with the Industry Jobs panel and owned-blueprints list on
 * the same character — `loadAllColonyDetails` fans out through
 * `mapWithConcurrencyLimit` rather than a bare `Promise.all` to stay well
 * under it.
 */
import {
  getCharacterPlanets,
  getCharacterPlanet,
  type CharacterPlanet,
  type CharacterPlanetDetail,
} from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';

const LIST_KEY = 'planets';
const DETAIL_CONCURRENCY = 3;

function detailKey(planetId: number): string {
  return `planet:${planetId}`;
}

const PLANETS_AUTH_POLICY = {
  detectAuthFailure: (err: unknown) => err instanceof EsiError && err.status === 403,
  skipCacheOnAuthFailure: true,
};

export function loadCharacterPlanets(
  characterId: number
): Promise<StatusResult<CharacterPlanet[]>> {
  return loadWithCacheStatus(
    characterId,
    LIST_KEY,
    async () => (await getCharacterPlanets(characterId)).data,
    PLANETS_AUTH_POLICY
  );
}

export function loadPlanetDetail(
  characterId: number,
  planetId: number
): Promise<StatusResult<CharacterPlanetDetail>> {
  return loadWithCacheStatus(
    characterId,
    detailKey(planetId),
    async () => (await getCharacterPlanet(characterId, planetId)).data,
    PLANETS_AUTH_POLICY
  );
}

/** Detail for every listed colony, concurrency-capped. */
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
