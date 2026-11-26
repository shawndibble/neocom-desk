import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationOrders, type CorporationOrder } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'orders';

export type CorpOrdersLoadResult = StatusResult<CorporationOrder[]>;

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
