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
import { EsiError } from '@/esi/client';
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

/**
 * Ids ESI has refused as invalid this session (a deleted or never-valid id),
 * so a page that re-asks for them does not re-spend the error budget finding
 * the same bad id again.
 */
const refusedIds = new Set<number>();

async function fetchEntries(ids: readonly number[]): Promise<Map<number, UniverseName>> {
  const resolved = new Map<number, UniverseName>();
  const askable = ids.filter((id) => !refusedIds.has(id));
  // One POST per batch, each guarded, so a failed batch keeps the others' names.
  for (let i = 0; i < askable.length; i += NAMES_BATCH) {
    await fetchBatch(askable.slice(i, i + NAMES_BATCH), resolved);
  }
  return resolved;
}

/**
 * ESI answers 404 to the *whole* POST when any one id in it is invalid, so a
 * single bad id used to blank every name beside it (a corp page mixing pilots,
 * corporations and systems showed `#id` for the lot). A 404 on a batch is split
 * in halves and each half asked again, down to the one id that is refused.
 * Any other failure (offline, 5xx) keeps the old behaviour: the batch is
 * skipped and whatever the caller read from cache stands.
 */
async function fetchBatch(
  batch: readonly number[],
  resolved: Map<number, UniverseName>
): Promise<void> {
  if (batch.length === 0) return;
  try {
    const entries = await postUniverseNames([...batch]);
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
  } catch (error) {
    if (!(error instanceof EsiError) || error.status !== 404) return;
    if (batch.length === 1) {
      refusedIds.add(batch[0]);
      return;
    }
    const middle = Math.ceil(batch.length / 2);
    await fetchBatch(batch.slice(0, middle), resolved);
    await fetchBatch(batch.slice(middle), resolved);
  }
}
