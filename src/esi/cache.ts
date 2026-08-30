/**
 * Shared ESI read-through cache: try live `esiFetch`, on success persist to
 * the generic `esiCache` Dexie table, on failure fall back to whatever is
 * cached. Never throws for "no network" — callers get `null` only when
 * there is neither a live response nor a cached one.
 *
 * Single implementation for a pattern every `features/*` data module used to
 * copy-paste (skills, character wallet/assets/mail/calendar/contracts/orders,
 * industry blueprints/jobs) — see docs/ARCHITECTURE.md §3.
 */
import { db } from '@/db';
import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure } from './client';
import { isCachePurgePending } from './cachePurge';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

/** Distinguishes "needs re-login" from "offline" (see loadWithCacheStatus). */
export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  /** True when the live call failed with 401/403 (or refresh itself failed): re-login is the fix, not a refresh. */
  needsReauth: boolean;
}

/**
 * `esiCache` is keyed by [characterId, key]; public, character-independent
 * lookups (universe types/names, station names) share this sentinel row
 * instead of one row per character.
 */
export const GLOBAL_CACHE_CHARACTER_ID = 0;

export interface LoadWithCacheStatusOptions {
  /**
   * Detect an auth failure from a thrown error. Defaults to `isAuthFailure`
   * (401/403 EsiError, or a failed token refresh). Override for a narrower
   * definition (e.g. industry/jobs.ts treats only a 403 as "needs reauth",
   * since a 401 there is treated as a generic offline-style failure).
   */
  detectAuthFailure?: (err: unknown) => boolean;
  /**
   * Skip the cache fallback read on an auth failure. For endpoints gated by
   * a scope added after some characters already logged in (e.g. industry
   * jobs), a character that never granted the scope has never cached a
   * response — there's nothing useful to fall back to, so the auth-failure
   * branch returns immediately instead of also checking the cache.
   */
  skipCacheOnAuthFailure?: boolean;
  /**
   * Consulted after a successful fetch, before the row is written. Return
   * false to keep whatever is already cached.
   *
   * D4: a paginated fetch that came up short must not overwrite a complete
   * cached list with a partial one — an older complete list under an honest
   * Data Age beats a fresh list that silently lost a page. Keeping partials
   * out of the cache is also what lets a cache hit report `truncated: false`
   * truthfully, since nothing partial is ever stored.
   */
  persistResult?: () => boolean;
}

/**
 * Like `loadWithCache`, but surfaces an auth failure (401/expired token,
 * 403/missing scope, or a failed token refresh) as `needsReauth: true`
 * instead of silently falling back to cache. Any other failure (offline,
 * 5xx, timeout) still falls through to the cache below.
 *
 * `needsReauth` never short-circuits the cache read by default: a caller
 * still using `loadWithCache` (which only reads `.cached`) must not regress
 * from stale-but-present to null just because a status-aware sibling
 * exists. Pass `skipCacheOnAuthFailure` for the one endpoint family that
 * deliberately wants the opposite (see options doc above).
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
      if (options.persistResult?.() !== false) {
        await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      }
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (detectAuthFailure(err)) {
      needsReauth = true;
      // The shell renders one notice for this (src/app/Layout.tsx). Covers the
      // window the route scope gate cannot: a revoke done in EVE's
      // third-party-application portal is invisible locally until the next
      // token refresh, so the stored grant still looks complete.
      emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
    // Any other failure (offline, 5xx, timeout): fall through to the cache below.
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true },
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
 * The single point where a cached row is allowed to reach a caller.
 *
 * A character whose purge is still pending (both purge tiers failed — see
 * `cachePurge.ts`) has rows on disk that we could not delete and are not
 * allowed to serve, so the cache reads as empty for it. One cheap in-memory
 * lookup per cache read, not per row: the durable marker is read once per
 * session. Writes are deliberately left alone — new rows are the *current*
 * owner's data, and the pending purge sweeps them anyway when it succeeds.
 */
async function readCachedRow(
  characterId: number,
  key: string
): Promise<{ value: unknown; fetchedAt: number } | undefined> {
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
