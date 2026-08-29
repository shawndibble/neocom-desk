/**
 * Fetch + cache layer for character skill data: try ESI, on success persist
 * to the generic `esiCache` Dexie table, on failure (offline, ESI down) fall
 * back to whatever is cached. Never throws for "no network" — callers get
 * `null` only when there is neither a live response nor a cached one.
 */
import { db } from '@/db';
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

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

const KEYS = {
  skills: 'skills',
  attributes: 'attributes',
  implants: 'implants',
  skillqueue: 'skillqueue',
} as const;

/**
 * `esiCache` is keyed by [characterId, key]; public, character-independent
 * lookups (universe type info) share this sentinel row instead of one row
 * per character.
 */
const GLOBAL_CACHE_CHARACTER_ID = 0;

async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<CachedResult<T> | null> {
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      return { data, fetchedAt: new Date(fetchedAt), fromCache: false };
    }
  } catch {
    // Offline or ESI failure: fall back to whatever is cached below.
  }
  const cached = await db.esiCache.get([characterId, key]);
  if (!cached) return null;
  return { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true };
}

/** Trained skills + total/unallocated SP for a character. ESI or cache. */
export function loadCharacterSkills(
  characterId: number
): Promise<CachedResult<CharacterSkills> | null> {
  return loadWithCache(
    characterId,
    KEYS.skills,
    async () => (await getCharacterSkills(characterId)).data
  );
}

/** Base + remap attribute values for a character. ESI or cache. */
export function loadCharacterAttributes(
  characterId: number
): Promise<CachedResult<CharacterAttributes> | null> {
  return loadWithCache(
    characterId,
    KEYS.attributes,
    async () => (await getCharacterAttributes(characterId)).data
  );
}

/** Implant type IDs plugged into the active clone. ESI or cache. */
export function loadCharacterImplants(characterId: number): Promise<CachedResult<number[]> | null> {
  return loadWithCache(
    characterId,
    KEYS.implants,
    async () => (await getCharacterImplants(characterId)).data
  );
}

/** In-game skill training queue. ESI or cache. */
export function loadCharacterSkillQueue(
  characterId: number
): Promise<CachedResult<SkillQueueEntry[]> | null> {
  return loadWithCache(
    characterId,
    KEYS.skillqueue,
    async () => (await getCharacterSkillQueue(characterId)).data
  );
}

/** Universe type info (name, description, icon group) for a typeID. Public, ESI or cache. */
export function loadUniverseType(typeId: number): Promise<CachedResult<UniverseType> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `type:${typeId}`,
    async () => (await getUniverseType(typeId)).data
  );
}
