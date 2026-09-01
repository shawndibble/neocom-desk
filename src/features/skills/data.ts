/**
 * Fetch + cache layer for character skill data: read-through against ESI via
 * the shared `esi/cache` helpers (esiFetch → esiCache Dexie table → stale
 * fallback).
 */
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
  loadWithCache,
  loadWithCacheStatus,
  GLOBAL_CACHE_CHARACTER_ID,
  type CachedResult,
  type ExpiresCapture,
  type StatusResult,
} from '@/esi/cache';
import type { Implants } from '@/engine/types';
import { extractAttributeBonuses, sumAttributeBonuses } from './dogma';

export type { CachedResult };

export const KEYS = {
  skills: 'skills',
  attributes: 'attributes',
  implants: 'implants',
  skillqueue: 'skillqueue',
} as const;

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

/**
 * Fetches the skill queue, capturing that response's own `Expires` header so
 * the shared cache can size a freshness window from it (issue #41) — read on
 * four routes (Overview, Skills, Plans, Industry), so a window here is what
 * turns a page-to-page nav into one round trip instead of four.
 */
function fetchSkillQueue(
  characterId: number,
  expiresCapture: ExpiresCapture
): () => Promise<SkillQueueEntry[] | null> {
  return async () => {
    const result = await getCharacterSkillQueue(characterId);
    expiresCapture.value = result.expires;
    return result.data;
  };
}

/** In-game skill training queue. ESI or cache. */
export function loadCharacterSkillQueue(
  characterId: number
): Promise<CachedResult<SkillQueueEntry[]> | null> {
  const expiresCapture: ExpiresCapture = { value: null };
  return loadWithCache(characterId, KEYS.skillqueue, fetchSkillQueue(characterId, expiresCapture), {
    expiresCapture,
  });
}

/**
 * Same data as loadCharacterSkillQueue, but with the auth-failure state
 * exposed (issue #14) for views that show a re-login affordance instead of a
 * silent "queue is empty" state when the skillqueue scope was revoked.
 */
export function loadCharacterSkillQueueWithStatus(
  characterId: number
): Promise<StatusResult<SkillQueueEntry[]>> {
  const expiresCapture: ExpiresCapture = { value: null };
  return loadWithCacheStatus(
    characterId,
    KEYS.skillqueue,
    fetchSkillQueue(characterId, expiresCapture),
    { expiresCapture }
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
