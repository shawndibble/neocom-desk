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
 * e.g. esi-issues #600 "universe/names 404'ing on type ids"). A large batch
 * (e.g. every implant across every jump clone, not just one clone's) is also
 * more likely to hit ESI's error-limit throttling (429/420) than a small one,
 * and by the time that reaches this catch, esiFetch has already retried once
 * internally and it is still failing. Either way — a bad id in the batch or
 * the batch itself being throttled — we fall back to resolving that chunk's
 * ids one at a time via GET /universe/types/{id}, skipping whichever of those
 * also fail. Any other ESI failure (5xx, 401/403) or a non-ESI failure
 * (offline, DNS) skips the per-id fallback instead: those calls would either
 * fail identically or pile more load onto an ESI that's already struggling.
 */
import { EsiError } from '@/esi/client';
import { getUniverseType, postUniverseNames } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCached,
  readCachedEntries,
  writeCached,
} from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

/** ESI's documented cap on ids per /universe/names request (maxItems in the spec). */
const NAMES_BATCH_LIMIT = 1000;

function cacheKey(typeId: number): string {
  return `type:${typeId}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Resolves whatever the SDE snapshot doesn't cover, via esiCache then ESI.
 *
 * Cache first, not cache-as-fallback — reading it last, as this used to, meant
 * a page holding any market- or asset-only type (which the slim snapshot
 * deliberately omits) blocked on a live POST on every single render.
 *
 * The same three tiers as `names.ts`, and the same `STALE_AFTER.static`
 * window: a type name is near-immutable but not actually immutable (tiericide
 * renamed hundreds of items), and a row with no window at all would be the one
 * place in the app a rename never arrived. Only an id with no cached name
 * makes the caller wait.
 */
async function resolveViaEsi(typeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, typeIds.map(cacheKey));
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const id of typeIds) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) {
      unknown.push(id);
      continue;
    }
    map.set(id, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.static) lapsed.push(id);
  }
  if (unknown.length === 0) {
    // Never awaited, and never re-entering this function: `fetchFromEsi` does
    // no cache read of its own, so a background refresh cannot schedule
    // another one.
    if (lapsed.length > 0) void fetchFromEsi(lapsed).catch(() => {});
    return map;
  }
  // One request for both tiers when the caller is waiting anyway.
  for (const [id, name] of await fetchFromEsi([...unknown, ...lapsed])) map.set(id, name);
  return map;
}

/** The network half: batched POST, per-id fallback, then whatever is cached. Never rejects. */
async function fetchFromEsi(typeIds: number[]): Promise<Map<number, string>> {
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
      // A 404 means one or more ids in the chunk are unresolvable and ESI
      // won't return partial results for the batch; a sustained 429/420
      // (esiFetch already retried once before this throws) means the same
      // thing in practice — the chunk never got resolved, not that its ids
      // are bad. Either way the per-id fallback below is worth firing.
      // Deliberately NOT widened to every EsiError: a 5xx means ESI itself is
      // struggling, and fanning out ESI_FANOUT_CONCURRENCY per-id calls into
      // that instead of falling straight to cache would make it worse, not
      // better; a 401/403 fallback would just fail identically per id. A
      // non-EsiError (a genuine network failure — offline, DNS, etc.) skips
      // this too: the per-id calls would fail the exact same way.
      if (
        err instanceof EsiError &&
        (err.status === 404 || err.status === 429 || err.status === 420)
      ) {
        const fetchedAt = Date.now();
        await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
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
      // A genuine network failure: fall through to whatever is cached below
      // for every id in this chunk.
    }
    for (const id of unresolved) {
      const cached = await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id));
      if (cached !== undefined) map.set(id, cached);
    }
  }
  return map;
}

/**
 * Type names from the local SDE snapshot and `esiCache` only — never a live
 * call. For fan-outs that run on page open (the cross-character PI timeline),
 * where `loadTypeNames`' POST /universe/names fallback would be exactly the
 * live traffic the caller is avoiding. Unresolved ids are absent rather than
 * filled with "Type #id": the caller decides what an unknown name reads as.
 */
export async function readCachedTypeNames(
  typeIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(typeIds)];
  const types = await loadTypes();
  const map = new Map<number, string>();
  await Promise.all(
    unique.map(async (id) => {
      const name =
        types[String(id)]?.name ??
        (await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id)));
      if (name) map.set(id, name);
    })
  );
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
