/**
 * Entity name lookups (mail senders, contract issuers, transaction clients)
 * via POST /universe/names, cached per-id in the generic `esiCache` table
 * under the global sentinel (see `esi/cache`).
 *
 * Cache-first, unlike the read-through loaders: a name is asked for by id, so
 * "which of these do I already have" is answerable without a request, and the
 * answer is usually "all of them". The previous shape POSTed every time and
 * used the cache only as an offline fallback, which put a live round-trip in
 * front of every render of Mail, Contracts, Contacts, Assets and Employment
 * History — part of the wait those pages showed a spinner for.
 */
import { postUniverseNames } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCached,
} from '@/esi/cache';

function cacheKey(id: number): string {
  return `name:${id}`;
}

/**
 * Names for a batch of entity IDs, keyed by id.
 *
 * Three tiers, and only the first blocks on the network:
 * - **No cached name.** Nothing to show, so the caller waits for the POST.
 * - **Cached and lapsed** (`STALE_AFTER.static` — an entity name is a game
 *   constant in all but the rarest case). The stored name is returned at once
 *   and refreshed behind the caller, so a page never waits on a lookup of
 *   something that almost never changes.
 * - **Cached and fresh.** Returned with no request at all.
 *
 * Ids with neither a live nor a cached name are simply absent from the
 * returned map (callers show `#id` themselves).
 */
export async function resolveNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;

  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, unique.map(cacheKey));
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
    if (now - row.fetchedAt >= STALE_AFTER.static) lapsed.push(id);
  }

  // One request for both tiers when the caller is waiting anyway: a lapsed
  // name costs nothing extra to refresh alongside an unknown one.
  if (unknown.length > 0) {
    for (const [id, name] of await fetchNames([...unknown, ...lapsed])) map.set(id, name);
    return map;
  }
  if (lapsed.length > 0) void fetchNames(lapsed);
  return map;
}

/** Resolves and caches. Never rejects, so the background call needs no handler of its own. */
async function fetchNames(ids: readonly number[]): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  try {
    const entries = await postUniverseNames([...ids]);
    const fetchedAt = Date.now();
    for (const entry of entries) {
      resolved.set(entry.id, entry.name);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(entry.id), entry.name, fetchedAt);
    }
  } catch {
    // Offline or ESI failure. Whatever the caller already read from cache
    // stands; an id with nothing cached is simply absent from its map.
  }
  return resolved;
}
