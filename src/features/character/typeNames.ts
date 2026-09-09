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
 * A 404 from the batch is the ONE failure worth answering with more requests.
 * ESI's POST /universe/names rejects the WHOLE batch with 404 if even one id
 * in it is unresolvable (not spelled out in the OpenAPI spec's generic
 * "default" error, but reproducible in practice and long tracked upstream,
 * e.g. esi-issues #600 "universe/names 404'ing on type ids"), and it returns
 * no partial result to salvage from. So one bad id costs the other 999 their
 * names unless we re-ask per id via GET /universe/types/{id} — a fan-out that
 * is capped at ESI_FANOUT_CONCURRENCY and actually buys something, because
 * every id except the bad one(s) resolves.
 *
 * Every other failure falls straight through to whatever `esiCache` holds,
 * and the throttling statuses (429 rate limit, 420 error limit) are the
 * emphatic case, not the borderline one (issue #655 item D). A 420 means we
 * have already spent ESI's error budget — 100 non-2xx responses per minute,
 * counted GLOBALLY across every route, so the overspend is being paid for by
 * every other surface in the app, not just this one. Re-asking per id cannot
 * route around that the way it routes around a bad id: the per-id calls are
 * the same traffic multiplied by up to 1000, each one a fresh non-2xx
 * deepening the outage it was fired in response to. `esiFetch` has also
 * already spent one blind retry (honoring Retry-After / the error-limit
 * reset) before the error reaches this catch, so a throttle that gets here is
 * a sustained one, not a blip a second attempt would clear. A 5xx, a 401/403
 * and a non-ESI failure (offline, DNS) skip the fan-out for the older, milder
 * reasons: the per-id calls would either fail identically or pile more load
 * onto an ESI that is already struggling.
 *
 * The cost of not fanning out is that a throttled chunk's uncached ids render
 * as "Type #id" until something asks again — which is the correct trade when
 * the alternative is making the throttle worse for every other panel.
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

/** The network half: batched POST, per-id fallback on a 404, then whatever is cached. Never rejects. */
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
      // 404 only, and the header says why at length — the short version is
      // that a 404 is the one failure per-id calls route *around* (one bad id
      // in the chunk) rather than repeat. Everything else, a 429/420 above
      // all, falls through to the cache read below instead of answering one
      // failed request with up to 1000 more.
      if (err instanceof EsiError && err.status === 404) {
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
      // Anything else (a throttle, a 5xx, an auth failure, offline):
      // `unresolved` is still the whole chunk, so every id in it falls through
      // to the cache read below and then to the caller's "Type #id".
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
