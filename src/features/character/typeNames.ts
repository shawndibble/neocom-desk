/**
 * Item type name lookups for Character views (wallet transactions, assets,
 * orders): resolved from the local SDE snapshot (public/data/types.json)
 * first — it already covers every skill/blueprint-referenced type — then via
 * a single batched POST /universe/names call for anything missing (the
 * market/asset-only types the slim snapshot doesn't carry). Resolved names
 * are cached in the generic `esiCache` table under the global sentinel (see
 * `esi/cache`) so they're available offline. Falls back to "Type #id" only
 * when neither the snapshot, a live ESI lookup, nor the cache has a name.
 *
 * ESI's POST /universe/names rejects the WHOLE batch with 404 if even one id
 * in it is unresolvable (not spelled out in the OpenAPI spec's generic
 * "default" error, but reproducible in practice and long tracked upstream,
 * e.g. esi-issues #600 "universe/names 404'ing on type ids"). On a 404 we
 * fall back to resolving that chunk's ids one at a time via
 * GET /universe/types/{id}, skipping whichever of those also fail.
 */
import { EsiError } from '@/esi/client';
import { getUniverseType, postUniverseNames } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { GLOBAL_CACHE_CHARACTER_ID, readCached, writeCached } from '@/esi/cache';

/** ESI's documented cap on ids per /universe/names request (maxItems in the spec). */
const NAMES_BATCH_LIMIT = 1000;

/**
 * Cap on simultaneous per-id GET /universe/types/{id} fallback calls (BUG
 * #6). The 404-batch fallback can be asked to resolve up to NAMES_BATCH_LIMIT
 * ids one at a time; firing all of them via a single Promise.all would be up
 * to 1000 concurrent requests.
 */
const TYPE_LOOKUP_CONCURRENCY = 10;

/** Runs `fn` over `items`, at most `limit` calls in flight at a time. */
async function mapWithConcurrencyLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function cacheKey(typeId: number): string {
  return `type:${typeId}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Resolves whatever the SDE snapshot doesn't cover, via ESI + esiCache. */
async function resolveViaEsi(typeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const ids of chunk(typeIds, NAMES_BATCH_LIMIT)) {
    let unresolved = ids;
    try {
      const resolved = await postUniverseNames(ids);
      const fetchedAt = Date.now();
      for (const entry of resolved) {
        if (entry.category !== 'inventory_type') continue;
        map.set(entry.id, entry.name);
        await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(entry.id), entry.name, fetchedAt);
      }
      unresolved = ids.filter((id) => !map.has(id));
    } catch (err) {
      if (err instanceof EsiError && err.status === 404) {
        // One or more ids in this chunk are unresolvable; ESI won't return
        // partial results for the batch, so resolve what we can one at a time.
        const fetchedAt = Date.now();
        await mapWithConcurrencyLimit(ids, TYPE_LOOKUP_CONCURRENCY, async (id) => {
          try {
            const { data } = await getUniverseType(id);
            if (!data) return; // 304 Not Modified: unreachable, no etag is ever sent here.
            map.set(id, data.name);
            await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id), data.name, fetchedAt);
          } catch {
            // Genuinely unresolvable, or offline mid-fallback: leave it to
            // the cache read below (or the caller's "Type #id" fallback).
          }
        });
        unresolved = ids.filter((id) => !map.has(id));
      }
      // Any other failure (offline, 5xx, etc.): fall through to whatever is
      // cached below for every id in this chunk.
    }
    for (const id of unresolved) {
      const cached = await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id));
      if (cached !== undefined) map.set(id, cached);
    }
  }
  return map;
}

/** Type name for one typeID, or the "Type #id" fallback. */
export async function loadTypeName(typeId: number): Promise<string> {
  const names = await loadTypeNames([typeId]);
  return names.get(typeId) ?? `Type #${typeId}`;
}

/** Type names for many typeIDs at once, keyed by typeID. */
export async function loadTypeNames(typeIds: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(typeIds)];
  const types = await loadTypes();
  const map = new Map<number, string>();
  const missing: number[] = [];
  for (const id of unique) {
    const name = types[String(id)]?.name;
    if (name) map.set(id, name);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const resolved = await resolveViaEsi(missing);
    for (const [id, name] of resolved) map.set(id, name);
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, `Type #${id}`);
  }
  return map;
}
