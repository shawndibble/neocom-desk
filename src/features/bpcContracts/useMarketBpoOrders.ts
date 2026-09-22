/**
 * Market BPO Order Books for BPC Sourcing (issue #1241): one Order Book view
 * (`loadOrderBookView`) per blueprint type, since ESI has no multi-type
 * filter (ADR 0003). Region mode — the whole region, not one station — with
 * Global Market Region resolution per type; a failed book is reported as
 * failed, never read as "no BPO".
 *
 * Deliberately lazy and bounded. The tab's results can span thousands of
 * blueprint types, so this never fetches for "every type on screen": the
 * panel passes only the one chosen blueprint, or the closest few matches of
 * a typed search (`MARKET_BPO_LOOKUP_LIMIT`), and nothing on an empty search.
 * A short debounce keeps each keystroke from starting its own fan-out, and
 * at most `ORDER_BOOK_FANOUT_CONCURRENCY` books are in flight at once, with a
 * superseded run queuing no more (same pattern as `useCompareRows`).
 */
import { useEffect, useRef, useState } from 'react';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';
import {
  clearOrderBookViewCache,
  loadGlobalMarketOverrides,
  loadOrderBookView,
  orderBookLocationFor,
} from '@/features/market/orderBookView';
import type { MarketBpoBook } from '@/features/bpcContracts/bpoAvailability';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  loadContractLocationInfo,
  type ContractLocationInfo,
} from '@/features/bpcContracts/blueprintLocation';

/** Most blueprint types a typed search checks the market for. */
export const MARKET_BPO_LOOKUP_LIMIT = 10;

/** Long enough to skip the intermediate keystrokes of a typed name. */
export const MARKET_BPO_LOOKUP_DEBOUNCE_MS = 300;

export interface MarketBpoLookup {
  /** Loaded book per checked type that has landed. A failed or pending type is absent. */
  booksByType: ReadonlyMap<number, MarketBpoBook>;
  /** Checked types whose book failed to load (a 420, the Error Budget gate). */
  failedTypeIds: ReadonlySet<number>;
  /** SDE station info per order location (`loadContractLocationInfo`). */
  locations: ReadonlyMap<number, ContractLocationInfo>;
  loading: boolean;
}

interface LookupState {
  key: string;
  booksByType: Map<number, MarketBpoBook>;
  failedTypeIds: Set<number>;
  locations: Map<number, ContractLocationInfo>;
  done: boolean;
}

function emptyState(key: string, done: boolean): LookupState {
  return { key, booksByType: new Map(), failedTypeIds: new Set(), locations: new Map(), done };
}

const EMPTY_BOOKS: ReadonlyMap<number, MarketBpoBook> = new Map();
const EMPTY_FAILED: ReadonlySet<number> = new Set();
const EMPTY_LOCATIONS: ReadonlyMap<number, ContractLocationInfo> = new Map();

/** `regionId` null or no `typeIds` = nothing to fetch. `refreshTick` bumps bypass the Order Book cache. */
export function useMarketBpoOrders(
  regionId: number | null,
  typeIds: readonly number[],
  refreshTick: number
): MarketBpoLookup {
  const key = regionId === null || typeIds.length === 0 ? '' : `${regionId}|${typeIds.join(',')}`;
  const [state, setState] = useState<LookupState | null>(null);
  const lastTick = useRef(refreshTick);

  useEffect(() => {
    if (key === '') return;
    const [regionPart, typePart] = key.split('|');
    const region = Number(regionPart);
    const types = typePart.split(',').map(Number);
    const forceRefresh = lastTick.current !== refreshTick;
    lastTick.current = refreshTick;
    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const globalMarkets = await loadGlobalMarketOverrides();
        if (cancelled) return;
        // hubStationId is unread in Region mode; the panel marks hub orders itself.
        const location = orderBookLocationFor(
          'region',
          region,
          { regionId: region, stationId: 0 },
          globalMarkets
        );
        if (forceRefresh) for (const typeId of types) clearOrderBookViewCache(typeId, location);
        await mapWithConcurrencyLimit(types, ORDER_BOOK_FANOUT_CONCURRENCY, async (typeId) => {
          if (cancelled) return;
          const view = await loadOrderBookView(typeId, location);
          if (cancelled) return;
          if (view.status === 'failed') {
            // One failed book leaves that type unchecked — and says so — not the panel blank.
            setState((prev) => {
              const base = prev?.key === key ? prev : emptyState(key, false);
              return { ...base, failedTypeIds: new Set(base.failedTypeIds).add(typeId) };
            });
            return;
          }
          const book: MarketBpoBook = { regionId: view.region.regionId, sell: view.sell };
          const locationIds = [...new Set(book.sell.map((o) => o.location_id))];
          const infos = await Promise.all(
            locationIds.map(async (id): Promise<[number, ContractLocationInfo]> => [
              id,
              await loadContractLocationInfo(id).catch(() => ({ name: null, space: null })),
            ])
          );
          if (cancelled) return;
          setState((prev) => {
            const base = prev?.key === key ? prev : emptyState(key, false);
            return {
              ...base,
              booksByType: new Map(base.booksByType).set(typeId, book),
              locations: new Map([...base.locations, ...infos]),
            };
          });
        });
        if (cancelled) return;
        setState((prev) => (prev?.key === key ? { ...prev, done: true } : emptyState(key, true)));
      })();
    }, MARKET_BPO_LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, refreshTick]);

  if (key === '' || state?.key !== key) {
    return {
      booksByType: EMPTY_BOOKS,
      failedTypeIds: EMPTY_FAILED,
      locations: EMPTY_LOCATIONS,
      loading: key !== '',
    };
  }
  return {
    booksByType: state.booksByType,
    failedTypeIds: state.failedTypeIds,
    locations: state.locations,
    loading: !state.done,
  };
}
