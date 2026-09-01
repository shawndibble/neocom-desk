/**
 * Fetches and summarizes the order book for every item in the Compare Set,
 * under the same region/Location Mode resolution `Market.tsx` uses for the
 * order book beside it (`resolveOrderBookRegion`, `filterOrdersByLocation`).
 * Only runs while `enabled` — the drawer's handle shows a count, not prices,
 * so a closed drawer must not fire N ESI reads.
 */
import { useEffect, useRef, useState } from 'react';
import { getOrderBook } from './orderBook';
import type { CompareSetItem } from './compareSet';
import type { LocationMode } from './locationMode';
import { resolveOrderBookRegion, type GlobalMarketOverride } from '@/engine/market/locationMode';
import { filterOrdersByLocation, summarizeOrderBook } from '@/engine/market/orderBook';
import type { OrderBookSummary } from '@/engine/market/orderBook';

export interface CompareRow {
  typeId: number;
  itemName: string;
  loading: boolean;
  /** Null while loading, or if the fetch for this item failed. */
  summary: OrderBookSummary | null;
}

export interface UseCompareRowsArgs {
  items: readonly CompareSetItem[];
  /** Fetch only while the drawer is actually open. */
  enabled: boolean;
  chosenRegionId: number;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>;
  locationMode: LocationMode;
  hubStationId: number;
  /** Bump to force a refetch past the order-book cache's TTL. */
  refreshTick: number;
}

export function useCompareRows({
  items,
  enabled,
  chosenRegionId,
  globalMarkets,
  locationMode,
  hubStationId,
  refreshTick,
}: UseCompareRowsArgs): CompareRow[] {
  const [rows, setRows] = useState<CompareRow[]>([]);

  // A fresh `items` array reference lands on nearly every render (the caller
  // may not memoize it), so the fetch effect keys on a value-stable typeId
  // signature instead — otherwise an unrelated re-render restarts every fetch.
  // Latest-ref pattern (`useRouteSnapshot.ts`): updated in its own effect,
  // never during render, and declared first so it is current before the
  // fetch effect below runs.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemsKey = items.map((item) => item.typeId).join(',');

  useEffect(() => {
    const currentItems = itemsRef.current;
    if (!enabled || currentItems.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(
      currentItems.map((item) => ({
        typeId: item.typeId,
        itemName: item.itemName,
        loading: true,
        summary: null,
      }))
    );
    void Promise.all(
      currentItems.map(async (item): Promise<CompareRow> => {
        try {
          const resolved = resolveOrderBookRegion(item.typeId, chosenRegionId, globalMarkets);
          const result = await getOrderBook(resolved.regionId, item.typeId);
          const orders =
            locationMode === 'hub'
              ? filterOrdersByLocation(result.orders, hubStationId)
              : result.orders;
          return {
            typeId: item.typeId,
            itemName: item.itemName,
            loading: false,
            summary: summarizeOrderBook(orders),
          };
        } catch {
          return { typeId: item.typeId, itemName: item.itemName, loading: false, summary: null };
        }
      })
    ).then((resolvedRows) => {
      if (!cancelled) setRows(resolvedRows);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, itemsKey, chosenRegionId, globalMarkets, locationMode, hubStationId, refreshTick]);

  return rows;
}
