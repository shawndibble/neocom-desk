/**
 * The two disciplines every corp-owned ESI read must apply (issue #293/#298),
 * bundled so a new corp data module gets both by calling one function instead
 * of assembling them by hand.
 *
 * `corpCacheKey` is enforced by construction — the corporation id is a
 * required argument, so a module cannot forget to corp-scope its key. Passing
 * `detectAuthFailure: detectCorpAuthFailure` is not: it is a plain options
 * field on `esi/cache.ts`'s loaders, so a module that omits it silently falls
 * back to the shared `isAuthFailure` rule, which counts a role-gated 403 as
 * "log in again" — exactly the `ReauthBanner`-over-a-403 failure corp UI
 * hides rather than locks to avoid (CONTEXT.md round 35). These wrappers make
 * that omission impossible in the same way the cache key already is.
 */
import {
  corpCacheKey,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  type LoadWithCacheStatusOptions,
  type StatusResult,
} from '@/esi/cache';
import type { TruncatableResult } from '@/esi/paginated';
import { detectCorpAuthFailure } from './corpAuthFailure';

type CorpReadOptions = Omit<LoadWithCacheStatusOptions, 'detectAuthFailure'>;

/** `loadWithCacheStatus`, corp-keyed and corp-auth-aware. */
export function loadCorpWithCacheStatus<T>(
  characterId: number,
  corporationId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: CorpReadOptions = {}
): Promise<StatusResult<T>> {
  return loadWithCacheStatus(characterId, corpCacheKey(corporationId, key), fetchLive, {
    ...options,
    detectAuthFailure: detectCorpAuthFailure,
  });
}

/** `loadPaginatedWithCacheStatus`, corp-keyed and corp-auth-aware. */
export function loadCorpPaginatedWithCacheStatus<T>(
  characterId: number,
  corporationId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: CorpReadOptions = {}
): Promise<StatusResult<T[]>> {
  return loadPaginatedWithCacheStatus(characterId, corpCacheKey(corporationId, key), fetchLive, {
    ...options,
    detectAuthFailure: detectCorpAuthFailure,
  });
}
