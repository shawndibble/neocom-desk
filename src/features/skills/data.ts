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
import { isAuthFailure } from '@/esi/client';
import type { Implants } from '@/engine/types';
import { extractAttributeBonuses, sumAttributeBonuses } from './dogma';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

/** BUG #3: distinguishes "needs re-login" from "offline" (see StatusResult callers). */
export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  /** True when the live call failed with 401/403 (or refresh itself failed): re-login is the fix, not a refresh. */
  needsReauth: boolean;
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

/**
 * BUG #3: like loadWithCache below, but surfaces an auth failure
 * (401/expired token, 403/missing scope, or a failed token refresh) as
 * `needsReauth: true` instead of silently falling back to cache — mirrors
 * src/features/industry/jobs.ts's existing needsReauth handling. Any other
 * failure (offline, 5xx, timeout) still falls through to the cache below.
 *
 * Unlike jobs.ts's needsReauth (which has nothing to fall back to — a
 * character that never granted that scope has never cached a response),
 * this function is shared with plain loadWithCache callers that DO have
 * prior cached data. So needsReauth never short-circuits the cache read:
 * a caller still using loadWithCache (which only reads `.cached`) must not
 * regress from stale-but-present to null just because a status-aware
 * sibling exists.
 */
async function loadWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<StatusResult<T>> {
  let needsReauth = false;
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (isAuthFailure(err)) needsReauth = true;
    // Any other failure (offline, 5xx, timeout): fall through to the cache below.
  }
  const cached = await db.esiCache.get([characterId, key]);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true },
    needsReauth,
  };
}

async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<CachedResult<T> | null> {
  return (await loadWithCacheStatus(characterId, key, fetchLive)).cached;
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

/**
 * Same data as loadCharacterSkills, but with the auth-failure state exposed
 * (BUG #3) for views that show a re-login affordance instead of a silent
 * "offline" state.
 */
export function loadCharacterSkillsWithStatus(
  characterId: number
): Promise<StatusResult<CharacterSkills>> {
  return loadWithCacheStatus(
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

/**
 * Aggregate attribute bonuses across a character's fitted implants: implant
 * typeIDs (ESI or cache) -> per-type dogma attributes (ESI or cache) -> summed
 * into one Implants map (engine's computeSchedule/optimizer input). Returns
 * `{}` when there's no implant data cached or fetchable (offline first-load).
 */
export async function loadImplantBonuses(characterId: number): Promise<Implants> {
  const implants = await loadCharacterImplants(characterId);
  const typeIds = implants?.data ?? [];
  const types = await Promise.all(typeIds.map((typeId) => loadUniverseType(typeId)));
  return sumAttributeBonuses(types.map((t) => extractAttributeBonuses(t?.data?.dogma_attributes)));
}
