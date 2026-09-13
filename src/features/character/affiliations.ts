/**
 * Corp/alliance/faction membership for a batch of character ids, via the
 * public POST /characters/affiliation — no scope, no token.
 *
 * Cache-first in the same three tiers as `names.ts`, and for the same reason:
 * a page asks by id, so "which of these do I already have" is answerable
 * without a request. Unlike a name, membership genuinely moves, so these rows
 * lapse on `STALE_AFTER.default` rather than `.static` — a lapsed row is still
 * shown at once and refreshed behind the caller.
 */
import { postCharactersAffiliation, type CharacterAffiliation } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCached,
} from '@/esi/cache';

function cacheKey(characterId: number): string {
  return `affiliation:${characterId}`;
}

/**
 * Affiliations keyed by character id. Ids with neither a live nor a cached
 * answer are absent from the map — callers show the name alone.
 */
export async function resolveAffiliations(
  characterIds: readonly number[]
): Promise<Map<number, CharacterAffiliation>> {
  const unique = [...new Set(characterIds)];
  const map = new Map<number, CharacterAffiliation>();
  if (unique.length === 0) return map;

  const cached = await readCachedEntries<CharacterAffiliation>(
    GLOBAL_CACHE_CHARACTER_ID,
    unique.map(cacheKey)
  );
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) {
      unknown.push(id);
      continue;
    }
    map.set(id, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.default) lapsed.push(id);
  }

  // One request for both tiers when the caller is waiting anyway.
  if (unknown.length > 0) {
    for (const [id, entry] of await fetchAffiliations([...unknown, ...lapsed])) map.set(id, entry);
    return map;
  }
  if (lapsed.length > 0) void fetchAffiliations(lapsed);
  return map;
}

/** Resolves and caches. Never rejects, so the background call needs no handler of its own. */
async function fetchAffiliations(
  ids: readonly number[]
): Promise<Map<number, CharacterAffiliation>> {
  const resolved = new Map<number, CharacterAffiliation>();
  try {
    const entries = await postCharactersAffiliation([...ids]);
    const fetchedAt = Date.now();
    for (const entry of entries) {
      resolved.set(entry.character_id, entry);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(entry.character_id), entry, fetchedAt);
    }
  } catch {
    // Offline or ESI failure. Whatever the caller read from cache stands.
  }
  return resolved;
}
