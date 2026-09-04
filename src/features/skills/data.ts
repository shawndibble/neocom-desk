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
  STALE_AFTER,
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

const TYPE_LOOKUP_RETRY_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUniverseTypeOnce(typeId: number): Promise<CachedResult<UniverseType> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `type:${typeId}`,
    async () => (await getUniverseType(typeId)).data,
    // An item type's name, description and dogma attributes change only when
    // CCP patches them — not on the app's 10-minute cadence.
    { staleAfterMs: STALE_AFTER.static }
  );
}

/**
 * Universe type info (name, description, icon group) for a typeID. Public,
 * ESI or cache.
 *
 * One retry on a failed live call, paced by a short delay: unlike
 * typeNames.ts's POST /universe/names (a batch with a per-id fallback), every
 * caller here — implant names and bonuses, notification item/skill names,
 * the clipboard import flow — resolves one type at a time, so a single
 * transient failure used to silently drop just that lookup (an implant read
 * "#12345", and the SAME failure also meant its attribute bonus never
 * reached `loadImplantBonuses`, reading the character's sheet as an
 * unexplainable "impossible" baseline). Retries indiscriminately rather than
 * narrowing by failure kind, since `loadWithCache` doesn't surface why a
 * call failed; the delay assumes a failure surviving esiFetch's own 429/420
 * retry (up to 10s) is a real rate-limit window, not a blip. Roughly doubles
 * the worst case on a persistent failure — accepted here, but two of
 * `foregroundPoller.ts`'s callers feed the Periodic Background Sync handler
 * (`notificationText`), which has its own execution-time limits and isn't
 * currently budget-aware the way `eveNotification`'s name resolution is
 * (issue #300); worth revisiting there if background notifications start
 * missing their window.
 */
export async function loadUniverseType(typeId: number): Promise<CachedResult<UniverseType> | null> {
  const first = await loadUniverseTypeOnce(typeId);
  if (first) return first;
  await sleep(TYPE_LOOKUP_RETRY_DELAY_MS);
  return loadUniverseTypeOnce(typeId);
}

/**
 * Aggregate attribute bonuses across a character's fitted implants: implant
 * typeIDs (ESI or cache) -> per-type dogma attributes (ESI or cache) -> summed
 * into one Implants map (engine's computeSchedule/optimizer input). Returns
 * `{}` when there's no implant data cached or fetchable (offline first-load).
 * `loadUniverseType` above already retries a failed per-type lookup once.
 */
export async function loadImplantBonuses(characterId: number): Promise<Implants> {
  const implants = await loadCharacterImplants(characterId);
  const typeIds = implants?.data ?? [];
  const types = await Promise.all(typeIds.map((typeId) => loadUniverseType(typeId)));
  return sumAttributeBonuses(types.map((t) => extractAttributeBonuses(t?.data?.dogma_attributes)));
}
