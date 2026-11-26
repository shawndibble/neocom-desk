import { useEffect, useMemo, useRef } from 'react';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';
import { loadOrderBookView, type OrderBookLocation } from '@/features/market/orderBookView';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getVariationRows } from '@/features/market/variations';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import type { VariationIndex } from '@/engine/market/variations';
import { useLazyRowCache } from '@/lib/useLazyRowCache';
import type { MarketTypeEntry } from '@/sde/marketTypes';

interface UseVariationsArgs {
  selectedTypeId: number | null;
  selectedItem: MarketTypeEntry | null;
  variationIndex: VariationIndex;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  typesById: ReadonlyMap<number, MarketTypeEntry>;
  orderBookLocation: OrderBookLocation;
  chosenRegionId: number;
  stationFilter: number | null;
  ready: boolean;
  refreshTick: number;
}

export function useVariations({
  selectedTypeId,
  selectedItem,
  variationIndex,
  typesByGroup,
  typesById,
  orderBookLocation,
  chosenRegionId,
  stationFilter,
  ready,
  refreshTick,
}: UseVariationsArgs) {
  const variationsResult = useMemo(
    () =>
      selectedItem ? getVariationRows(variationIndex, typesByGroup, typesById, selectedItem) : null,
    [variationIndex, typesByGroup, typesById, selectedItem]
  );
  const variationsResultRef = useRef(variationsResult);
  useEffect(() => {
    variationsResultRef.current = variationsResult;
  });

  const { byKey, load, reset } = useLazyRowCache<string, OrderBookSummary>();
  const variationLocationKey = `${chosenRegionId}:${orderBookLocation.mode}:${orderBookLocation.hubStationId}:${stationFilter ?? 'none'}`;
  const priceTargets = useMemo(
    () => [
      ...(selectedItem ? [{ typeId: selectedItem.typeId }] : []),
      ...(variationsResult?.rows ?? []),
    ],
    [selectedItem, variationsResult]
  );
  const headerScopeSummary =
    selectedTypeId === null ? undefined : byKey.get(`${selectedTypeId}:${variationLocationKey}`);
  const variationPrices = useMemo(() => {
    const m = new Map<number, OrderBookSummary | undefined>();
    for (const row of variationsResult?.rows ?? []) {
      m.set(row.typeId, byKey.get(`${row.typeId}:${variationLocationKey}`));
    }
    return m;
  }, [variationsResult, byKey, variationLocationKey]);

  useEffect(() => {
    if (priceTargets.length === 0 || !ready) return;
    let cancelled = false;
    void mapWithConcurrencyLimit(priceTargets, ORDER_BOOK_FANOUT_CONCURRENCY, async (row) => {
      if (cancelled) return;
      const key = `${row.typeId}:${variationLocationKey}`;
      reset(key);
      await load(key, async () => {
        const view = await loadOrderBookView(row.typeId, { ...orderBookLocation, stationFilter });
        return view.status === 'failed'
          ? { bestSell: null, bestBuy: null, spread: null, availableVolume: 0 }
          : view.summary;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    priceTargets,
    orderBookLocation,
    stationFilter,
    ready,
    refreshTick,
    variationLocationKey,
    load,
    reset,
  ]);

  return { variationsResult, variationsResultRef, variationPrices, headerScopeSummary };
}
