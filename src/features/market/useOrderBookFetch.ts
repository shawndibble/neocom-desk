import { useEffect, useMemo, useState } from 'react';
import { regionsForSystems } from '@/engine/market/locationMode';
import {
  fetchOrderBook,
  fetchOrderBookAcross,
  type OrderBookFetch,
  type OrderBookLocation,
} from '@/features/market/orderBookView';
import type { JumpRangeFilter } from '@/features/route/currentSystem';
import type { MarketRegionEntry } from '@/sde/marketTypes';

interface UseOrderBookFetchArgs {
  selectedTypeId: number | null;
  bookLocation: OrderBookLocation;
  resetKey: string;
  onReset: () => void;
  ready: boolean;
  fetchesAcross: boolean;
  jumpRangeFilter: JumpRangeFilter;
  marketRegions: MarketRegionEntry[] | null;
  allMarketRegionIds: number[];
  systemRegions: ReadonlyMap<number, { regionId: number }>;
  refreshTick: number;
}

export function useOrderBookFetch({
  selectedTypeId,
  bookLocation,
  resetKey,
  onReset,
  ready,
  fetchesAcross,
  jumpRangeFilter,
  marketRegions,
  allMarketRegionIds,
  systemRegions,
  refreshTick,
}: UseOrderBookFetchArgs) {
  const [orderBookFetch, setOrderBookFetch] = useState<OrderBookFetch | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);

  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (resetKey !== resetForKey) {
    setResetForKey(resetKey);
    onReset();
    setOrderBookFetch(null);
    if (selectedTypeId !== null) setOrderBookLoading(true);
  }

  const allRegionsFetchKey = useMemo((): string | null => {
    if (!fetchesAcross || marketRegions === null || jumpRangeFilter.status === 'loading')
      return null;
    if (jumpRangeFilter.status === 'ready' && jumpRangeFilter.allowed !== null) {
      const inReach = regionsForSystems(jumpRangeFilter.allowed, systemRegions);
      return allMarketRegionIds.filter((id) => inReach.has(id)).join(',');
    }
    return allMarketRegionIds.join(',');
  }, [fetchesAcross, marketRegions, jumpRangeFilter, systemRegions, allMarketRegionIds]);
  const allRegionsFetchIds = useMemo(
    () =>
      allRegionsFetchKey === null
        ? null
        : allRegionsFetchKey === ''
          ? []
          : allRegionsFetchKey.split(',').map(Number),
    [allRegionsFetchKey]
  );

  useEffect(() => {
    if (selectedTypeId === null || !ready) return;
    if (fetchesAcross && allRegionsFetchIds === null) return;
    let cancelled = false;
    void (async () => {
      setOrderBookLoading(true);
      const fetched =
        allRegionsFetchIds !== null
          ? await fetchOrderBookAcross(
              selectedTypeId,
              allRegionsFetchIds,
              bookLocation,
              () => cancelled
            )
          : await fetchOrderBook(selectedTypeId, bookLocation);
      if (cancelled) return;
      setOrderBookFetch(fetched);
      setOrderBookLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, bookLocation, fetchesAcross, allRegionsFetchIds, ready, refreshTick]);

  return { orderBookFetch, orderBookLoading };
}
