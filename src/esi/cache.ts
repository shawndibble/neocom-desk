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
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  let needsReauth = false;
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
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
 * The only cache entry point accepting a `TruncatableResult`, so a caller
 * cannot silently drop the flag.
 */
export async function loadPaginatedWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>
): Promise<CachedResult<T[]> | null> {
  try {
    const { items, truncated } = await fetchLive();
    const fetchedAt = Date.now();
    const existing = truncated ? await readCachedRow(characterId, key) : undefined;
    const wouldClobberCompleteList = existing !== undefined && existing.truncated !== true;
    if (!wouldClobberCompleteList) {
      await db.esiCache.put({ characterId, key, value: items, fetchedAt, truncated });
      return { data: items, fetchedAt: new Date(fetchedAt), fromCache: false, truncated };
    }
    return {
      data: existing.value as T[],
      fetchedAt: new Date(existing.fetchedAt),
      fromCache: true,
      truncated: false,
    };
  } catch {
    // Offline/5xx/auth: fall back to cache, as loadWithCache does.
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return null;
  return {
    data: cached.value as T[],
    fetchedAt: new Date(cached.fetchedAt),
    fromCache: true,
    truncated: cached.truncated === true,
  };
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
): Promise<{ value: unknown; fetchedAt: number; truncated?: boolean } | undefined> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCache.get([characterId, key]);
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
