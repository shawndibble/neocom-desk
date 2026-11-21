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
 * hides rather than locks to avoid (GLOSSARY.md round 35). These wrappers make
 * that omission impossible in the same way the cache key already is.
 */
import {
  corpCacheKey,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  type LoadPaginatedWithCacheOptions,
  type LoadSingleWithCacheOptions,
  type StatusResult,
} from '@/esi/cache';
import type { TruncatableResult } from '@/esi/paginated';
import { HOUR_MS } from '@/lib/age';
import { detectCorpAuthFailure } from './corpAuthFailure';

/** How long ESI caches a corporation's structures and its assets alike. */
const CORP_HOURLY_CACHE_MS = HOUR_MS;

/**
 * When EVE read a corporation's structures or assets, from the read's ESI
 * `Expires` (kept by a loader that passes `expiresCapture`): ESI caches each
 * for an hour from that read. Null when unknown — a row stored without
 * `Expires`, or a read that sent none.
 */
export function eveReadAtMs(expiresAt: Date | undefined): number | null {
  return expiresAt ? expiresAt.getTime() - CORP_HOURLY_CACHE_MS : null;
}

type CorpReadOptions = Omit<LoadSingleWithCacheOptions, 'detectAuthFailure'>;
type CorpPaginatedReadOptions<T> = Omit<LoadPaginatedWithCacheOptions<T>, 'detectAuthFailure'>;

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
  options: CorpPaginatedReadOptions<T> = {}
): Promise<StatusResult<T[]>> {
  return loadPaginatedWithCacheStatus(characterId, corpCacheKey(corporationId, key), fetchLive, {
    ...options,
    detectAuthFailure: detectCorpAuthFailure,
  });
}

/** A read that was allowed and came back with nothing: the widget shows Retry. */
export class CorpReadFailed extends Error {
  constructor(what: string) {
    super(`corp ${what} read failed`);
    this.name = 'CorpReadFailed';
  }
}
