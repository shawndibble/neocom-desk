import {
  getCharacterAttributes,
  getCharacterImplants,
  getCharacterSkillQueue,
  getCharacterSkills,
  getUniverseType,
  type CharacterAttributes,
  type CharacterSkills,
  type SkillQueueEntry,
  type UniverseType,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCache,
  loadWithCacheStatus,
  loadStaticEntity,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

export type { CachedResult };

export const KEYS = {
  skills: 'skills',
  attributes: 'attributes',
  implants: 'implants',
  skillqueue: 'skillqueue',
} as const;

export function loadCharacterSkills(
  characterId: number
): Promise<CachedResult<CharacterSkills> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterSkills(characterId, options)
  );
  return loadWithCache(characterId, KEYS.skills, fetchLive, { conditional });
}

export function loadCharacterSkillsWithStatus(
  characterId: number
): Promise<StatusResult<CharacterSkills>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterSkills(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.skills, fetchLive, { conditional });
}

export function loadCharacterAttributes(
  characterId: number
): Promise<CachedResult<CharacterAttributes> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterAttributes(characterId, options)
  );
  return loadWithCache(characterId, KEYS.attributes, fetchLive, { conditional });
}

export function loadCharacterImplants(characterId: number): Promise<CachedResult<number[]> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterImplants(characterId, options)
  );
  return loadWithCache(characterId, KEYS.implants, fetchLive, { conditional });
}

export function loadCharacterImplantsWithStatus(
  characterId: number
): Promise<StatusResult<number[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterImplants(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.implants, fetchLive, { conditional });
}

function fetchSkillQueue(characterId: number) {
  return conditionalFetch((options) => getCharacterSkillQueue(characterId, options));
}

export function loadCharacterSkillQueue(
  characterId: number
): Promise<CachedResult<SkillQueueEntry[]> | null> {
  const { fetchLive, conditional } = fetchSkillQueue(characterId);
  return loadWithCache(characterId, KEYS.skillqueue, fetchLive, { conditional });
}

export function loadCharacterSkillQueueWithStatus(
  characterId: number
): Promise<StatusResult<SkillQueueEntry[]>> {
  const { fetchLive, conditional } = fetchSkillQueue(characterId);
  return loadWithCacheStatus(characterId, KEYS.skillqueue, fetchLive, { conditional });
}

const TYPE_LOOKUP_RETRY_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNIVERSE_TYPE_PREFIX = 'universeType';

export function loadUniverseTypeOnce(typeId: number): Promise<CachedResult<UniverseType> | null> {
  return loadStaticEntity(UNIVERSE_TYPE_PREFIX, typeId, getUniverseType);
}

export async function loadUniverseType(typeId: number): Promise<CachedResult<UniverseType> | null> {
  const first = await loadUniverseTypeOnce(typeId);
  if (first) return first;
  await sleep(TYPE_LOOKUP_RETRY_DELAY_MS);
  return loadUniverseTypeOnce(typeId);
}
