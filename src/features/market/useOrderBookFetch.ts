/**
 * The selected item's settled order-book fetch: a single book, or the
 * region-set fan-out for All regions / a set Jump Range. The view itself is
 * derived from this by the caller, so station filtering narrows it in place
 * without another request.
 */
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
  /** The Browser's own book location (`bookLocation`). */
  bookLocation: OrderBookLocation;
  /** Changes whenever the item or the book's scope does; the prior fetch is dropped on it. */
  resetKey: string;
  /** Runs in the render that sees `resetKey` change, to reset sibling state alongside the fetch. */
  onReset: () => void;
  /**
   * Every persisted setting and `globalMarkets.json` have settled. Gating on
   * this keeps the fetch from firing once for the defaults and again once the
   * persisted settings resolve — for All Regions with a persisted Jump Range
   * especially, a slow, wasted full fan-out on every visit. Global Market
   * Region items (a PLEX deep link) would also be read from the wrong region.
   */
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
  // The selected item's settled fetch, null until it lands.
  const [orderBookFetch, setOrderBookFetch] = useState<OrderBookFetch | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);

  // `allRegions` apart from `chosenRegionId` (in the caller's key): The Forge →
  // All regions with Jita as hub is the same region id, yet a different book.
  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (resetKey !== resetForKey) {
    setResetForKey(resetKey);
    onReset();
    setOrderBookFetch(null);
    // `browser.station` clears in `navigateTo` itself, not here — every path
    // that changes `resetKey` goes through it, and clearing it here too was a
    // second, independent `useUrlParams` writer landing in the same render as
    // `navigateTo`'s own write, which silently dropped one of the two.
    // Set in the same render as the reset above, not left for the fetch
    // effect a tick later — otherwise the one commit in between paints
    // `orderBookLoading: false` alongside the just-cleared `orderBookFetch`,
    // which the table below reads as "loaded, and empty" and flashes the
    // empty state before the spinner.
    if (selectedTypeId !== null) setOrderBookLoading(true);
  }

  // All regions' (or a set range's) fan-out: every Market Region the picker
  // lists, or — once a Jump Range is measurable — only those holding an
  // in-range system, so "within 5 jumps" costs a few regions, not every one.
  // Waits (null) while the range is still resolving rather than firing every
  // region and then a few. Keyed by a joined string so an unchanged set never
  // refetches.
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

  // Refetches on selection, location, or a manual Refresh click.
  // `fetchOrderBook` never rejects: a 420 or an Error Budget refusal settles
  // as `'failed'`, which renders its own state rather than an empty book or a
  // spinner that never clears.
  useEffect(() => {
    if (selectedTypeId === null || !ready) return;
    // Waits for the region list and the range (see `allRegionsFetchKey`).
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
