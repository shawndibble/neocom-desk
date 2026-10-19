/**
 * Variations (GLOSSARY.md round 6): the selected item's Tech/Meta/Faction
 * variation group, falling back to Market Group siblings, plus each row's own
 * price at the header's location.
 */
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
  /** Hub, Location Mode and `globalMarkets.json` have settled. */
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
  // Re-anchored whenever selectedItem changes — including a click on a row
  // itself, which just becomes the new selectedItem.
  const variationsResult = useMemo(
    () =>
      selectedItem ? getVariationRows(variationIndex, typesByGroup, typesById, selectedItem) : null,
    [variationIndex, typesByGroup, typesById, selectedItem]
  );
  // Latest-ref pattern (useCompareRows.ts): the caller's refresh reads this
  // value only on click, well after it settles — a ref sidesteps the ordering
  // entirely instead of asking the render function to read ahead.
  const variationsResultRef = useRef(variationsResult);
  useEffect(() => {
    variationsResultRef.current = variationsResult;
  });

  // Per-row price cache for the Variations table (`useLazyRowCache`), keyed
  // by typeId AND the location signal (region/mode/station/stationFilter) —
  // not typeId alone — so changing any of those reads as a brand new key
  // with nothing cached yet: the table goes blank the instant the row set or
  // the location changes, the same render, with no Effect-delayed flash of
  // the old item's prices under the new one. refreshTick deliberately isn't
  // part of the key: a manual refresh reuses the same key and pairs `reset`
  // with `load` below to force a fresh fetch that overwrites the value in
  // place, rather than blanking the table back to a loading state.
  const { byKey, load, reset } = useLazyRowCache<string, OrderBookSummary>();
  const variationLocationKey = `${chosenRegionId}:${orderBookLocation.mode}:${orderBookLocation.hubStationId}:${stationFilter ?? 'none'}`;
  // The selected item rides the same per-row cache at the same location, so
  // its own price and its variations' can't be read from different books.
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

  // Fetched independently of the main order book, so a slow row's price
  // never delays the order book's own render (acceptance criteria). Also
  // reruns on refreshTick so a manual Refresh — which clears getOrderBook's
  // cache — refetches row prices too, not just the on-screen tables.
  useEffect(() => {
    if (priceTargets.length === 0 || !ready) return;
    let cancelled = false;
    // Capped, not one Promise.all: ~20 rows fired at once tripped Sentry's
    // N+1 API Call detector (ORDER_BOOK_FANOUT_CONCURRENCY).
    void mapWithConcurrencyLimit(priceTargets, ORDER_BOOK_FANOUT_CONCURRENCY, async (row) => {
      if (cancelled) return;
      const key = `${row.typeId}:${variationLocationKey}`;
      // Forces this run to actually fetch even for a key it already
      // resolved — the refreshTick case the key itself doesn't capture
      // (see the comment above `useLazyRowCache`). `load` still overwrites `byKey` in
      // place once it resolves, so the row keeps showing its old price
      // until the new one lands.
      reset(key);
      await load(key, async () => {
        const view = await loadOrderBookView(row.typeId, { ...orderBookLocation, stationFilter });
        // A row's own price is a nice-to-have next to the order book that did
        // load; a failed fetch reads as "no orders" (the empty summary) rather
        // than stalling the table on a spinner forever.
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
