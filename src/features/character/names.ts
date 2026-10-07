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
import { postUniverseNames, type UniverseName } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCachedMany,
} from '@/esi/cache';

/** ESI's per-request cap for /universe/names. */
const NAMES_BATCH = 1000;

function cacheKey(id: number): string {
  return `name:${id}`;
}

function categoryKey(id: number): string {
  return `category:${id}`;
}

export type NameCategory = UniverseName['category'];

/**
 * What kind of entity each id is (character, corporation, alliance, ...), for
 * a caller that can't tell from context — a contract's acceptor may be a pilot
 * or a corp. Cache-first like `resolveNames`; a name cached before categories
 * were stored has none, so it is looked up once. Ids that can't be resolved
 * are absent.
 */
export async function resolveCategories(
  ids: readonly number[]
): Promise<Map<number, NameCategory>> {
  const unique = [...new Set(ids)];
  const map = new Map<number, NameCategory>();
  if (unique.length === 0) return map;
  const cached = await readCachedEntries<NameCategory>(
    GLOBAL_CACHE_CHARACTER_ID,
    unique.map(categoryKey)
  );
  const unknown: number[] = [];
  for (const id of unique) {
    const row = cached.get(categoryKey(id));
    if (row === undefined) unknown.push(id);
    else map.set(id, row.value);
  }
  if (unknown.length > 0) {
    for (const [id, category] of await fetchCategories(unknown)) map.set(id, category);
  }
  return map;
}

async function fetchCategories(ids: readonly number[]): Promise<Map<number, NameCategory>> {
  const out = new Map<number, NameCategory>();
  for (const [id, entry] of await fetchEntries(ids)) out.set(id, entry.category);
  return out;
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

/**
 * The cached names for `ids`, lapsed or not, with no request of any kind —
 * for a caller that must never touch the network (the Command Palette
 * searches on every keystroke). Ids never resolved on this device are absent.
 */
export async function readCachedNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, unique.map(cacheKey));
  const map = new Map<number, string>();
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row !== undefined) map.set(id, row.value);
  }
  return map;
}

/** Resolves and caches. Never rejects, so the background call needs no handler of its own. */
async function fetchNames(ids: readonly number[]): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  for (const [id, entry] of await fetchEntries(ids)) resolved.set(id, entry.name);
  return resolved;
}

async function fetchEntries(ids: readonly number[]): Promise<Map<number, UniverseName>> {
  const resolved = new Map<number, UniverseName>();
  // One POST per batch, each guarded, so a failed batch keeps the others' names.
  for (let i = 0; i < ids.length; i += NAMES_BATCH) {
    try {
      const entries = await postUniverseNames(ids.slice(i, i + NAMES_BATCH));
      const fetchedAt = Date.now();
      for (const entry of entries) resolved.set(entry.id, entry);
      await writeCachedMany(
        GLOBAL_CACHE_CHARACTER_ID,
        entries.flatMap((entry) => [
          [cacheKey(entry.id), entry.name] as const,
          [categoryKey(entry.id), entry.category] as const,
        ]),
        fetchedAt
      );
    } catch {
      // Offline or ESI failure. Whatever the caller already read from cache
      // stands; an id with nothing cached is simply absent from its map.
    }
  }
  return resolved;
}
