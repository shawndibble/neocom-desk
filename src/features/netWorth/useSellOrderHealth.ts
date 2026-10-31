import { useMemo } from 'react';
import { buildOpenOrderRows } from '@/features/market/openOrdersModel';
import { sellOrderHealth, type SellOrderHealth } from '@/features/market/orderHealthSplit';
import type { OpenOrdersPageSnapshot } from '@/features/market/openOrdersPageSnapshot';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

// Deferred: the Orders read reaches type names, skills, the station table and
// the competition loaders, none of which the rest of Balance needs on first paint.
const loadOrders = (characterId: number, signal: RouteSnapshotSignal<OpenOrdersPageSnapshot>) =>
  import('@/features/market/openOrdersPageSnapshot').then((m) =>
    m.loadOpenOrdersSnapshot(characterId, signal)
  );

/**
 * The Characters' sell-order ISK by health, from the read Open Orders and the
 * Overview card share (same cache key), so a Balance visit after either costs
 * nothing extra. Null until it loads or when it fails.
 */
export function useSellOrderHealth(characterIds: readonly number[]): SellOrderHealth | null {
  const { data } = useRouteSnapshot(loadOrders, undefined, { cacheKey: 'market:open-orders' });
  const idsKey = characterIds.join(',');
  return useMemo(() => {
    if (!data) return null;
    const ids = new Set(idsKey === '' ? [] : idsKey.split(',').map(Number));
    const rows = buildOpenOrderRows({
      snapshot: data.openOrders,
      typeNames: data.typeNames,
      stationPrices: data.stationPrices,
      costBases: data.costBases,
      walletBasisGaps: data.walletBasisGaps,
      stationNames: new Map([...data.npcStations].map(([id, s]) => [id, s.name])),
      skillsByCharacter: data.skillsByCharacter,
      now: data.now,
    }).filter((row) => ids.has(row.characterId));
    return sellOrderHealth(rows);
  }, [data, idsKey]);
}
