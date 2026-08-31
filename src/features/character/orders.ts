/** Fetch + cache layer for the Orders view: open orders + history. */
import {
  getCharacterOrders,
  getCharacterOrderHistory,
  type MarketOrder,
  type MarketOrderHistory,
} from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEYS = {
  open: 'orders',
  history: 'orders:history',
} as const;

/**
 * Open market orders (single ESI call, not paginated). ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the orders scope was revoked (issue #14).
 */
export function loadOrders(characterId: number): Promise<StatusResult<MarketOrder[]>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.open,
    async () => (await getCharacterOrders(characterId)).data
  );
}

/** Closed/expired order history (every page). ESI or cache, with the auth-failure state exposed. */
export function loadOrderHistory(characterId: number): Promise<StatusResult<MarketOrderHistory[]>> {
  return loadWithCacheStatus(characterId, KEYS.history, () =>
    getCharacterOrderHistory(characterId)
  );
}
