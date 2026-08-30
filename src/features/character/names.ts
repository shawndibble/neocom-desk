/**
 * Entity name lookups (mail senders, contract issuers, transaction clients)
 * via POST /universe/names, cached per-id in the generic `esiCache` table
 * under the global sentinel (see `esi/cache`).
 */
import { postUniverseNames } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCached, writeCached } from '@/esi/cache';

function cacheKey(id: number): string {
  return `name:${id}`;
}

/**
 * Names for a batch of entity IDs, keyed by id. Falls back to a per-id cache
 * read for anything not returned by a failed/partial live request; ids with
 * neither a live nor cached name are simply absent from the returned map
 * (callers show `#id` themselves).
 */
export async function resolveNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;

  let missing = unique;
  try {
    const resolved = await postUniverseNames(unique);
    const fetchedAt = Date.now();
    for (const entry of resolved) {
      map.set(entry.id, entry.name);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(entry.id), entry.name, fetchedAt);
    }
    missing = unique.filter((id) => !map.has(id));
  } catch {
    // Offline or ESI failure: fall through to cached values for every id below.
  }

  for (const id of missing) {
    const cached = await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id));
    if (cached !== undefined) map.set(id, cached);
  }
  return map;
}
