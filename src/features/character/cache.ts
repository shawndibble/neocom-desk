/**
 * Fetch + cache layer shared by every Character view (wallet, assets, mail,
 * calendar, contracts, orders): try ESI, on success persist to the generic
 * `esiCache` Dexie table, on failure (offline, ESI down) fall back to
 * whatever is cached. Never throws for "no network" — callers get `null`
 * only when there is neither a live response nor a cached one.
 *
 * Mirrors src/features/skills/data.ts's read-through pattern (duplicated
 * rather than imported/exported, same as src/features/industry/data.ts
 * already does — that module is read-only territory for this feature).
 */
import { db } from '@/db';
import { isAuthFailure } from '@/esi/client';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

/** BUG #3: distinguishes "needs re-login" from "offline" (see loadWithCacheStatus). */
export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  /** True when the live call failed with 401/403 (or refresh itself failed): re-login is the fix, not a refresh. */
  needsReauth: boolean;
}

/**
 * Public, character-independent lookups (station names, universe/names
 * results) share this sentinel row instead of one row per character. Must
 * match the constant of the same name in src/features/skills/data.ts.
 */
export const GLOBAL_CACHE_CHARACTER_ID = 0;

export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<CachedResult<T> | null> {
  return (await loadWithCacheStatus(characterId, key, fetchLive)).cached;
}

/**
 * BUG #3: like loadWithCache, but surfaces an auth failure (401/expired
 * token, 403/missing scope, or a failed token refresh) as
 * `needsReauth: true` instead of silently falling back to cache — mirrors
 * src/features/industry/jobs.ts's existing needsReauth handling. Any other
 * failure (offline, 5xx, timeout) still falls through to the cache below.
 *
 * Unlike jobs.ts's needsReauth (which has nothing to fall back to — a
 * character that never granted that scope has never cached a response),
 * this function is shared with plain loadWithCache callers that DO have
 * prior cached data. So needsReauth never short-circuits the cache read:
 * a view can show "log in again" AND keep the last-known cached value
 * available (e.g. for a caller still using loadWithCache, which only reads
 * `.cached` and would otherwise regress from stale-but-present to null).
 */
export async function loadWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<StatusResult<T>> {
  let needsReauth = false;
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (isAuthFailure(err)) needsReauth = true;
    // Any other failure (offline, 5xx, timeout): fall through to the cache below.
  }
  const cached = await db.esiCache.get([characterId, key]);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true },
    needsReauth,
  };
}
