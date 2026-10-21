/**
 * Fetch + cache layer for the corporation's open market orders (issue #4612).
 *
 * Corp-keyed and corp-auth-aware through `corpRead.ts`. A 403 here is a
 * missing Accountant/Trader role or a scope not yet granted; the capability's
 * scope is additive (`corpScopes.ts`), and callers gate on `canReadOrders`
 * before reading.
 */
import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationOrders, type CorporationOrder } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'orders';

export type CorpOrdersLoadResult = StatusResult<CorporationOrder[]>;

/** Open orders of the corporation. ESI or cache. */
export function loadCorporationOrders(
  characterId: number,
  corporationId: number
): Promise<CorpOrdersLoadResult> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationOrders(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEY, fetchLive, {
    conditional,
  });
}
