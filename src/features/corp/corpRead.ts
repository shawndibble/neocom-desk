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

const CORP_HOURLY_CACHE_MS = HOUR_MS;

export function eveReadAtMs(expiresAt: Date | undefined): number | null {
  return expiresAt ? expiresAt.getTime() - CORP_HOURLY_CACHE_MS : null;
}

type CorpReadOptions = Omit<LoadSingleWithCacheOptions, 'detectAuthFailure'>;
type CorpPaginatedReadOptions<T> = Omit<LoadPaginatedWithCacheOptions<T>, 'detectAuthFailure'>;

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

export class CorpReadFailed extends Error {
  constructor(what: string) {
    super(`corp ${what} read failed`);
    this.name = 'CorpReadFailed';
  }
}
