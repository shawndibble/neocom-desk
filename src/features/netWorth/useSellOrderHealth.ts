import { useMemo } from 'react';
import {
  loadOpenOrdersSnapshotLazy,
  openOrderRowsFromSnapshot,
} from '@/features/market/openOrdersSnapshotRows';
import { sellOrderHealth, type SellOrderHealth } from '@/features/market/orderHealthSplit';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';

/**
 * The Characters' sell-order ISK by health, from the read Open Orders and the
 * Overview card share (same cache key), so a Balance visit after either costs
 * nothing extra. Null until it loads or when it fails.
 */
export function useSellOrderHealth(characterIds: readonly number[]): SellOrderHealth | null {
  const { data } = useRouteSnapshot(loadOpenOrdersSnapshotLazy, undefined, {
    cacheKey: 'market:open-orders',
  });
  const idsKey = characterIds.join(',');
  return useMemo(() => {
    if (!data) return null;
    const ids = new Set(idsKey === '' ? [] : idsKey.split(',').map(Number));
    return sellOrderHealth(
      openOrderRowsFromSnapshot(data).filter((row) => ids.has(row.characterId))
    );
  }, [data, idsKey]);
}
