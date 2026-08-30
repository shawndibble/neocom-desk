/** Fetch + cache layer for the Orders view: open orders + history. */
import {
  getCharacterOrders,
  getCharacterOrderHistory,
  type MarketOrder,
  type MarketOrderHistory,
} from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from '@/esi/cache';

const KEYS = {
  open: 'orders',
  history: 'orders:history',
} as const;

/** Open market orders (single ESI call, not paginated). ESI or cache. */
export function loadOrders(characterId: number): Promise<CachedResult<MarketOrder[]> | null> {
  return loadWithCache(
    characterId,
    KEYS.open,
    async () => (await getCharacterOrders(characterId)).data
  );
}

/** Closed/expired order history (every page). ESI or cache. */
export function loadOrderHistory(
  characterId: number
): Promise<CachedResult<MarketOrderHistory[]> | null> {
  return loadWithCache(characterId, KEYS.history, () => getCharacterOrderHistory(characterId));
}
