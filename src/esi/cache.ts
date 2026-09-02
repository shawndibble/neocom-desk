/**
 * Shared ESI read-through cache: try live `esiFetch`, persist to the generic
 * `esiCache` Dexie table on success, fall back to whatever is cached on
 * failure. Never throws for "no network" — `null` means neither a live
 * response nor a cached one. One implementation for every `features/*` data
 * module (docs/ARCHITECTURE.md §3).
 */
import { db } from '@/db';
import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure } from './client';
import { isCachePurgePending } from './cachePurge';
import type { TruncatableResult } from './paginated';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
  /**
   * The list is missing pages. Stored on the row so it survives a cache hit —
   * a short list must not look whole after a reload.
   */
  truncated: boolean;
}

/** Distinguishes "needs re-login" from "offline" (see loadWithCacheStatus). */
export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  /** True when the live call failed with 401/403 (or refresh itself failed): re-login is the fix, not a refresh. */
  needsReauth: boolean;
}

/**
 * `esiCache` is keyed by [characterId, key]; character-independent public
 * lookups (universe types/names, stations) share this sentinel row rather than
 * one row per character.
 */
export const GLOBAL_CACHE_CHARACTER_ID = 0;

/**
 * Written by `fetchLive` itself, right after a successful live call, with
 * ESI's raw `Expires` header (or null). `loadWithCacheStatus` and
 * `loadPaginatedWithCacheStatus` both read it back once `fetchLive` resolves
 * and use it to size that row's freshness window — this is how the window
 * reflects what that specific response declared rather than a guessed
 * constant. A plain shared box rather than widening `fetchLive`'s return
 * type: only the handful of callers that opt in via `expiresCapture` need to
 * touch this; every other caller's `fetchLive` keeps returning bare `T | null`
 * (or `TruncatableResult<T>`).
 */
export interface ExpiresCapture {
  value: string | null;
}

/**
 * How long a cached row is served without a live call. The window is a floor,
 * not a ceiling: `readFreshRow` takes whichever is later, this or ESI's own
 * `Expires` (issue #221 / CONTEXT.md round 25) — so an endpoint ESI caches for
 * an hour keeps that hour, while one it caches for 60s still holds for the
 * full 10 minutes the app promises.
 */
export const STALE_AFTER = {
  /**
   * A Character's own mutable data — skills, wallet, assets, orders, jobs,
   * mail, colonies. Ten minutes is the app-wide promise: page-to-page
   * navigation inside it never touches the network.
   */
  default: 10 * 60_000,
  /**
   * Data that does not meaningfully change: universe types, stations, systems,
   * routes, PI schematics and planet names, a delivered mail's body, an issued
   * contract's item list. Refetching these on a 10-minute cadence would spend
   * most of the prefetch budget re-learning constants.
   */
  static: 24 * 60 * 60_000,
} as const;

/**
 * How long after `invalidateFreshness()` a stale-at-that-instant row stays
 * ineligible for a freshness hit.
 *
 * The invalidation signal is global (one module-level timestamp), which was
 * harmless when exactly one key had a window. Now that every key does, an
 * unbounded signal would mean one Refresh click on Wallet sends the next visit
 * to Assets, Mail, Contracts and Orders all back to the network — defeating
 * the caching this exists to provide. Bounding it confines the bypass to the
 * reload the user actually asked for, which runs immediately after the click.
 */
export const REFRESH_BYPASS_MS = 30_000;

export interface LoadWithCacheStatusOptions {
  /**
   * Defaults to `isAuthFailure` (401/403 EsiError, or a failed refresh).
   * Override to narrow: industry/jobs.ts counts only 403, treating a 401 as a
   * generic offline-style failure.
   */
  detectAuthFailure?: (err: unknown) => boolean;
  /**
   * Skip the cache fallback read on an auth failure. For an endpoint gated by
   * a scope added after some characters already logged in (e.g. industry
   * jobs), a character that never granted it has nothing cached to fall back
   * to.
   */
  skipCacheOnAuthFailure?: boolean;
  /** See `ExpiresCapture`. Optional — the window no longer depends on it. */
  expiresCapture?: ExpiresCapture;
  /** Freshness window for this key; see `STALE_AFTER`. Defaults to `STALE_AFTER.default`. */
  staleAfterMs?: number;
}

/**
 * Epoch ms of the last `invalidateFreshness()` call. A row is only eligible
 * for a freshness-window skip if it was fetched at or after this instant, and
 * only for `REFRESH_BYPASS_MS` afterwards — so a manual refresh (which calls
 * `invalidateFreshness()` first) always forces a live call for whatever it's
 * about to reload, without threading a "force" flag through every loader and
 * route, and without sending every *other* route back to the network too.
 */
let freshnessInvalidatedAt = 0;

/**
 * Call before a manual refresh re-runs its loader(s), so the freshness window
 * never holds back a user-requested reload. Global and coarse on purpose: a
 * per-key flag threaded through every route would cost a lot more surface area
 * for the same guarantee. `REFRESH_BYPASS_MS` is what keeps that coarseness
 * affordable now that every key has a window.
 */
export function invalidateFreshness(): void {
  freshnessInvalidatedAt = Date.now();
}

/**
 * Whether a manual refresh should force this row live rather than serve it.
 *
 * Two bounds on what one Refresh click reaches, both because the invalidation
 * signal is a single global timestamp:
 *
 * - **In time.** Only for `REFRESH_BYPASS_MS`, so the click does not also send
 *   the next visit to every unrelated route back to the network.
 * - **In kind.** Only keys on the default window. A Refresh means "re-read my
 *   data", not "re-read the star map": Assets alone resolves a station,
 *   structure or system name per distinct location, and refetching those would
 *   turn one click into a fan-out over data that cannot have changed. The
 *   `STALE_AFTER.static` loaders are exactly the ones that hold game
 *   constants, so the window length is already the right discriminator — no
 *   second flag to keep in step with it.
 */
function isRefreshInvalidated(fetchedAt: number, staleAfterMs: number, now: number): boolean {
  if (staleAfterMs > STALE_AFTER.default) return false;
  // <=, not <: a manual refresh calling invalidateFreshness() right after a
  // fetch that landed in the same millisecond must still force the next call
  // live, not read the row it just invalidated as still-fresh.
  return fetchedAt <= freshnessInvalidatedAt && now - freshnessInvalidatedAt <= REFRESH_BYPASS_MS;
}

function parseExpiresHeader(expires: string | null | undefined): number | undefined {
  if (!expires) return undefined;
  const ms = Date.parse(expires);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * One shared map for both the singular and paginated read-through paths:
 * concurrent identical reads (same characterId + key) collapse onto the one
 * in-flight promise instead of racing separate ESI calls. Deleted in a
 * `finally` so a rejection never poisons the entry for the next call.
 */
const inFlightLoads = new Map<string, Promise<unknown>>();

function dedupeKey(characterId: number, key: string): string {
  return `${characterId}:${key}`;
}

/**
 * Collapses concurrent identical reads onto one in-flight promise. The single
 * shared `inFlightLoads` map serves both `T` (singular) and `T[]` (paginated)
 * callers, so the cast on a dedupe hit is unavoidable without two maps; this
 * is the one place it happens rather than one per caller.
 */
async function withDedupe<R>(characterId: number, key: string, run: () => Promise<R>): Promise<R> {
  const dkey = dedupeKey(characterId, key);
  const existing = inFlightLoads.get(dkey);
  if (existing) return existing as Promise<R>;

  const promise = run();
  inFlightLoads.set(dkey, promise);
  try {
    return await promise;
  } finally {
    inFlightLoads.delete(dkey);
  }
}

/**
 * Like `loadWithCache`, but surfaces an auth failure (401 expired token, 403
 * missing scope, failed refresh) as `needsReauth` instead of silently falling
 * back. Any other failure (offline, 5xx, timeout) still falls through.
 *
 * `needsReauth` never short-circuits the cache read by default: a caller on
 * `loadWithCache`, which reads only `.cached`, must not regress from
 * stale-but-present to null because a status-aware sibling exists.
 */
export async function loadWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions = {}
): Promise<StatusResult<T>> {
  const fresh = await readFreshRow<T>(
    characterId,
    key,
    options.staleAfterMs ?? STALE_AFTER.default
  );
  if (fresh) return { cached: fresh, needsReauth: false };

  return withDedupe(characterId, key, () =>
    loadWithCacheStatusLive(characterId, key, fetchLive, options)
  );
}

async function loadWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions
): Promise<StatusResult<T>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  let needsReauth = false;
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      const expiresAt = parseExpiresHeader(options.expiresCapture?.value);
      await db.esiCache.put({
        characterId,
        key,
        value: data,
        fetchedAt,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false, truncated: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (detectAuthFailure(err)) {
      needsReauth = true;
      // The shell renders one notice (src/app/Layout.tsx). Covers the window
      // the route scope gate cannot: a revoke done in EVE's third-party-app
      // portal is invisible locally until the next token refresh, so the
      // stored grant still looks complete.
      emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: {
      data: cached.value as T,
      fetchedAt: new Date(cached.fetchedAt),
      fromCache: true,
      truncated: cached.truncated === true,
    },
    needsReauth,
  };
}

/**
 * A row still inside its freshness window — served without a live call.
 *
 * The window is `max(the row's own Expires, fetchedAt + staleAfterMs)`: the
 * TTL is a floor every key gets, and ESI's header only ever extends it. Before
 * issue #221 the header was the whole mechanism, so a key whose loader did not
 * opt into `expiresCapture` had no window at all.
 *
 * `fromCache` is `false` here: this is a successful, on-time read, not the
 * degraded "live call failed, fell back to a stale row" case that flag
 * otherwise means, and views use it to decide whether to show an offline banner.
 */
async function readFreshRow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number
): Promise<CachedResult<T> | null> {
  const row = await readCachedRow(characterId, key);
  if (!row) return null;
  const now = Date.now();
  if (Math.max(row.expiresAt ?? 0, row.fetchedAt + staleAfterMs) <= now) return null;
  if (isRefreshInvalidated(row.fetchedAt, staleAfterMs, now)) return null;
  return {
    data: row.value as T,
    fetchedAt: new Date(row.fetchedAt),
    fromCache: false,
    truncated: row.truncated === true,
  };
}

/** ESI or cache, dropping the auth-failure distinction for callers that don't need it. */
export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions = {}
): Promise<CachedResult<T> | null> {
  return (await loadWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

/**
 * Read-through for a paginated list, where a fetch can come back short.
 *
 * Enforced, not an option: a partial list may not overwrite a complete one —
 * an older complete list under an honest Data Age beats a fresh list that
 * silently lost a page. A partial IS stored when nothing is cached, or when
 * the cached row is itself partial; refusing outright would leave the cache
 * permanently cold for an endpoint that truncates every time, like the wallet
 * transactions page cap.
 *
 * The only cache entry points accepting a `TruncatableResult`, so a caller
 * cannot silently drop the flag. Like `loadWithCacheStatus`, the `...Status`
 * variant reports an auth failure as `needsReauth` rather than a silent
 * fallback.
 */
export async function loadPaginatedWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions = {}
): Promise<StatusResult<T[]>> {
  const fresh = await readFreshRow<T[]>(
    characterId,
    key,
    options.staleAfterMs ?? STALE_AFTER.default
  );
  if (fresh) return { cached: fresh, needsReauth: false };

  return withDedupe(characterId, key, () =>
    loadPaginatedWithCacheStatusLive(characterId, key, fetchLive, options)
  );
}

async function loadPaginatedWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions
): Promise<StatusResult<T[]>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  let needsReauth = false;
  try {
    const { items, truncated } = await fetchLive();
    const fetchedAt = Date.now();
    const existing = truncated ? await readCachedRow(characterId, key) : undefined;
    const wouldClobberCompleteList = existing !== undefined && existing.truncated !== true;
    if (!wouldClobberCompleteList) {
      const expiresAt = parseExpiresHeader(options.expiresCapture?.value);
      await db.esiCache.put({
        characterId,
        key,
        value: items,
        fetchedAt,
        truncated,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
      return {
        cached: { data: items, fetchedAt: new Date(fetchedAt), fromCache: false, truncated },
        needsReauth: false,
      };
    }
    return {
      cached: {
        data: existing.value as T[],
        fetchedAt: new Date(existing.fetchedAt),
        fromCache: true,
        truncated: false,
      },
      needsReauth: false,
    };
  } catch (err) {
    // Offline/5xx: fall back to cache, as loadWithCacheStatus does. An auth
    // failure additionally sets needsReauth so a revoked scope offers a
    // re-login instead of a silent empty list (issue #14).
    if (detectAuthFailure(err)) {
      needsReauth = true;
      emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: {
      data: cached.value as T[],
      fetchedAt: new Date(cached.fetchedAt),
      fromCache: true,
      truncated: cached.truncated === true,
    },
    needsReauth,
  };
}

/** Paginated read-through, dropping the auth-failure distinction. */
export async function loadPaginatedWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions = {}
): Promise<CachedResult<T[]> | null> {
  return (await loadPaginatedWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

/**
 * The single point where a cached row is allowed to reach a caller.
 *
 * A character whose purge is still pending has rows we could not delete and
 * are not allowed to serve, so its cache reads as empty (`cachePurge.ts`).
 * One in-memory lookup per read, not per row. Writes are deliberately left
 * alone — new rows are the *current* owner's data, and the pending purge
 * sweeps them when it succeeds.
 */
async function readCachedRow(
  characterId: number,
  key: string
): Promise<
  { value: unknown; fetchedAt: number; truncated?: boolean; expiresAt?: number } | undefined
> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCache.get([characterId, key]);
}

/**
 * Same gate as `readCachedRow`, for one key across many characters. Lives
 * here so the D1 purge check has exactly one implementation — a caller doing
 * its own `bulkGet` would bypass it and serve a previous owner's rows.
 *
 * Returns a map so an absent character is distinguishable from one whose
 * cached value is itself empty. The purge check runs *after* the read: a
 * purge that becomes pending mid-batch still suppresses the row.
 */
export async function readCachedRows<T>(
  characterIds: readonly number[],
  key: string
): Promise<Map<number, CachedResult<T>>> {
  const found = new Map<number, CachedResult<T>>();
  if (characterIds.length === 0) return found;

  const rows = await db.esiCache.bulkGet(characterIds.map((id): [number, string] => [id, key]));
  const suppressed = await Promise.all(characterIds.map((id) => isCachePurgePending(id)));

  rows.forEach((row, i) => {
    if (!row || suppressed[i]) return;
    found.set(characterIds[i], {
      data: row.value as T,
      fetchedAt: new Date(row.fetchedAt),
      fromCache: true,
      truncated: row.truncated === true,
    });
  });
  return found;
}

/** Raw cache read, for callers doing their own batch/partial-resolution (names.ts, typeNames.ts). */
export async function readCached<T>(characterId: number, key: string): Promise<T | undefined> {
  const row = await readCachedRow(characterId, key);
  return row?.value as T | undefined;
}

/** Raw cache write; `fetchedAt` is a parameter so a caller stamping a whole batch uses one timestamp. */
export async function writeCached<T>(
  characterId: number,
  key: string,
  value: T,
  fetchedAt: number
): Promise<void> {
  await db.esiCache.put({ characterId, key, value, fetchedAt });
}
