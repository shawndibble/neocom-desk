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

/**
 * Trained skills + total/unallocated SP for a character. ESI or cache.
 * Revalidated by ETag: an unchanged skill sheet (the usual case between
 * trainings) costs a 304, not a re-download and rewrite.
 */
export function loadCharacterSkills(
  characterId: number
): Promise<CachedResult<CharacterSkills> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterSkills(characterId, options)
  );
  return loadWithCache(characterId, KEYS.skills, fetchLive, { conditional });
}

/**
 * Same data as loadCharacterSkills, but with the auth-failure state exposed
 * (BUG #3) for views that show a re-login affordance instead of a silent
 * "offline" state.
 */
export function loadCharacterSkillsWithStatus(
  characterId: number
): Promise<StatusResult<CharacterSkills>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterSkills(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.skills, fetchLive, { conditional });
}

/** Base + remap attribute values for a character. ESI or cache. */
export function loadCharacterAttributes(
  characterId: number
): Promise<CachedResult<CharacterAttributes> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterAttributes(characterId, options)
  );
  return loadWithCache(characterId, KEYS.attributes, fetchLive, { conditional });
}

/** Implant type IDs plugged into the active clone. ESI or cache. */
export function loadCharacterImplants(characterId: number): Promise<CachedResult<number[]> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterImplants(characterId, options)
  );
  return loadWithCache(characterId, KEYS.implants, fetchLive, { conditional });
}

/**
 * Same data as loadCharacterImplants, with the auth-failure state exposed for
 * views (Clones) that show a re-login prompt for a missing read-implants grant
 * instead of silently reading it as "no implants".
 */
export function loadCharacterImplantsWithStatus(
  characterId: number
): Promise<StatusResult<number[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterImplants(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.implants, fetchLive, { conditional });
}

/**
 * Fetches the skill queue by ETag. The capture also carries that response's
 * own `Expires` header, so the shared cache sizes a freshness window from it
 * (issue #41) — read on four routes (Overview, Skills, Plans, Industry), so a
 * window here is what turns a page-to-page nav into one round trip instead of
 * four.
 */
function fetchSkillQueue(characterId: number) {
  return conditionalFetch((options) => getCharacterSkillQueue(characterId, options));
}

/** In-game skill training queue. ESI or cache. */
export function loadCharacterSkillQueue(
  characterId: number
): Promise<CachedResult<SkillQueueEntry[]> | null> {
  const { fetchLive, conditional } = fetchSkillQueue(characterId);
  return loadWithCache(characterId, KEYS.skillqueue, fetchLive, { conditional });
}

/**
 * Same data as loadCharacterSkillQueue, but with the auth-failure state
 * exposed (issue #14) for views that show a re-login affordance instead of a
 * silent "queue is empty" state when the skillqueue scope was revoked.
 */
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

/**
 * Distinct from typeNames.ts's `type:${id}` — that module caches a plain
 * `string` (just the resolved name) under that key, while this one caches a
 * full `UniverseType` object (name, description, dogma_attributes). The two
 * used to share the `type:${id}` key: whichever wrote first "won", and under
 * `STALE_AFTER.static`'s long window the loser was stuck reading a
 * wrong-shaped row far into the future with no live re-fetch to correct it.
 * In practice: visiting Clones (or Wallet/Orders/Assets/Corp — anything
 * feeding typeNames.ts's loadTypeNames) for an implant type before Skills
 * ever loaded it live cached that id's row as a bare string. Skills.tsx then
 * read `row.value as UniverseType`, got a string, and `info?.name` /
 * `info?.dogma_attributes` both came back `undefined` — the implant showed
 * as its bare `#typeId` with its attribute bonus silently dropped, and
 * because the row read as "fresh", `loadUniverseType`'s own retry (below)
 * never even fired: `loadUniverseTypeOnce` returned a truthy (if
 * wrong-shaped) result on the very first pass.
 */
const UNIVERSE_TYPE_PREFIX = 'universeType';

/**
 * One cache-first, ETag-revalidated read of a type (no retry, no delay):
 * `null` only when the type is neither cached nor fetchable, so a type seen
 * once still renders offline; `loadUniverseType` adds a retry on top for the
 * one-at-a-time callers that want it. Readers of only description, dogma
 * attributes or volume use `typeDetail.ts` (baked first).
 */
export function loadUniverseTypeOnce(typeId: number): Promise<CachedResult<UniverseType> | null> {
  // An item type's name, description and dogma attributes change only when
  // CCP patches them — not on the app's 10-minute cadence.
  return loadStaticEntity(UNIVERSE_TYPE_PREFIX, typeId, getUniverseType);
}

/**
 * Universe type info (name, description, icon group) for a typeID. Public,
 * ESI or cache.
 *
 * One retry on a failed live call, paced by a short delay: unlike
 * typeNames.ts's POST /universe/names (a batch with a per-id fallback), every
 * caller here — notification item/skill names, and `typeDetail.ts`'s `retry`
 * fallback (required skills, hardpoints, implants, clipboard import) —
 * resolves one type at a time, so a single transient failure would silently
 * drop just that lookup (an implant read "#12345", and its attribute
 * bonus never reached the sum, reading the character's sheet as an
 * unexplainable "impossible" baseline). Retries indiscriminately rather than
 * narrowing by failure kind, since `loadWithCache` doesn't surface why a
 * call failed; the delay assumes a failure surviving esiFetch's own 429/420
 * retry (up to 10s) is a real rate-limit window, not a blip. Roughly doubles
 * the worst case on a persistent failure — accepted here, but two of
 * `foregroundPoller.ts`'s callers feed the notification poll's text
 * resolution (`renderNotification`), which has its own execution-time limits
 * and isn't currently budget-aware the way `eveNotification`'s name
 * resolution is (issue #300); worth revisiting there if notifications start
 * missing their window.
 */
export async function loadUniverseType(typeId: number): Promise<CachedResult<UniverseType> | null> {
  const first = await loadUniverseTypeOnce(typeId);
  if (first) return first;
  await sleep(TYPE_LOOKUP_RETRY_DELAY_MS);
  return loadUniverseTypeOnce(typeId);
}
