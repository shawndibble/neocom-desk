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
import {
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

/**
 * The cache keys this module owns, exported so a cross-character reader
 * (`features/pi/roster.ts`) reads exactly the rows these loaders write —
 * same convention as `features/skills/data.ts`'s `KEYS`, so the literal
 * strings cannot drift apart.
 */
export const KEYS = { planets: LIST_KEY, planetDetail: detailKey } as const;

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

/**
 * Detail for one Character's colonies from Dexie only — never a fetch.
 *
 * `loadAllColonyDetails` below is one live call per planet; multiplied by
 * every authenticated Character on page open that is a rate-limit problem on
 * the shared `char-industry` bucket, for a panel that is glanceable rather
 * than authoritative. An absent entry means "not cached", which the caller
 * must be able to tell from a colony that really has no extractors.
 */
export async function readCachedColonyDetails(
  characterId: number,
  planetIds: readonly number[]
): Promise<Map<number, CachedResult<CharacterPlanetDetail>>> {
  const found = new Map<number, CachedResult<CharacterPlanetDetail>>();
  await Promise.all(
    planetIds.map(async (planetId) => {
      // Via `readCachedRows` rather than a bare `bulkGet`: it is the one place
      // the pending-purge gate runs, and bypassing it can serve a previous
      // owner's rows.
      const row = (
        await readCachedRows<CharacterPlanetDetail>([characterId], detailKey(planetId))
      ).get(characterId);
      if (row) found.set(planetId, row);
    })
  );
  return found;
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
