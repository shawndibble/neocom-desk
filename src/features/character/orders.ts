import {
  getCharacterOrders,
  getCharacterOrderHistory,
  type MarketOrder,
  type MarketOrderHistory,
} from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  conditionalFetch,
  loadWithCacheStatus,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';

export const KEYS = {
  open: 'orders',
  history: 'orders:history',
} as const;

export function loadOrders(characterId: number): Promise<StatusResult<MarketOrder[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterOrders(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.open, fetchLive, { conditional });
}

export function loadOrderHistory(characterId: number): Promise<StatusResult<MarketOrderHistory[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterOrderHistory(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEYS.history, fetchLive, { conditional });
}
