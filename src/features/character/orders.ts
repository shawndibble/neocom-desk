/** Fetch + cache layer for the Orders view: open orders + history. */
import {
  getCharacterOrders,
  getCharacterOrderHistory,
  type MarketOrder,
  type MarketOrderHistory,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCacheStatus,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';

export const KEYS = {
  open: 'orders',
  history: 'orders:history',
} as const;

/**
 * Open market orders (single ESI call, not paginated). ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the orders scope was revoked (issue #14).
 */
export function loadOrders(characterId: number): Promise<StatusResult<MarketOrder[]>> {
  // Revalidated by ETag: an unchanged order book costs a 304, not a rewrite.
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterOrders(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.open, fetchLive, { conditional });
}

/**
 * Closed/expired order history (every page). ESI or cache, with the
 * auth-failure state exposed. `truncated` means pages were missing.
 */
export function loadOrderHistory(characterId: number): Promise<StatusResult<MarketOrderHistory[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEYS.history, () =>
    getCharacterOrderHistory(characterId)
  );
}
