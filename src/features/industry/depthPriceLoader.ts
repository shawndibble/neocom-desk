/**
 * Loads Depth Prices: each candidate material's region Order Book
 * (`getOrderBook`, 300 s cache), walked at the hub station for the need.
 * Which materials are candidates is `depthCandidates`/`summedDepthNeeds`'
 * call — this only fetches and walks.
 *
 * A book that fails to load drops that material back to the lowest sell: an
 * Order Book outage must not leave a plan unpriced.
 */
import { useCallback, useMemo } from 'react';
import { walkSellBook, type DepthPrice } from '@/engine/industry/depthPrice';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { TradeHub } from '@/market/hubs';
import { getOrderBook, ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';

export type DepthPrices = ReadonlyMap<number, DepthPrice>;
type Books = ReadonlyMap<number, readonly HubOrder[]>;

const NO_DEPTH_PRICES: DepthPrices = new Map();

/** Each type's region Order Book; a type whose book failed to load is absent. */
async function loadBooks(regionId: number, typeIds: readonly number[]): Promise<Books> {
  const books = new Map<number, readonly HubOrder[]>();
  await mapWithConcurrencyLimit(typeIds, ORDER_BOOK_FANOUT_CONCURRENCY, async (typeID) => {
    try {
      books.set(typeID, (await getOrderBook(regionId, typeID)).orders);
    } catch {
      // Lowest sell stands for this material.
    }
  });
  return books;
}

function walkBooks(
  books: Books,
  stationId: number,
  needs: ReadonlyMap<number, number>
): Map<number, DepthPrice> {
  const depth = new Map<number, DepthPrice>();
  for (const [typeID, need] of needs) {
    const orders = books.get(typeID);
    const walk = orders && walkSellBook(orders, stationId, need);
    if (walk) depth.set(typeID, walk);
  }
  return depth;
}

export async function loadDepthPrices(
  hub: Pick<TradeHub, 'regionId' | 'stationId'>,
  needs: ReadonlyMap<number, number>
): Promise<Map<number, DepthPrice>> {
  return walkBooks(await loadBooks(hub.regionId, [...needs.keys()]), hub.stationId, needs);
}

export interface PlanDepthPrices {
  /** `needs` walked; empty until their books land. */
  depth: DepthPrices;
  /** Walks other needs (Break Even's trial run counts) through the books already loaded. */
  walk: (needs: ReadonlyMap<number, number>) => DepthPrices;
}

/**
 * The plan page's Depth Prices for `needs` at `hub`. Books are fetched per
 * set of types (and again whenever the plan's prices refresh; `getOrderBook`'s
 * 300 s cache decides whether that hits the network) and walked on every need change, so editing runs re-prices
 * without a fetch. While a changed set loads, the books already held keep
 * pricing the types they cover rather than every row dropping to lowest sell.
 */
export function useDepthPrices(
  hub: TradeHub,
  needs: ReadonlyMap<number, number>,
  /** Changes when the plan's prices refresh, so the books refresh with them. */
  pricesFetchedAt: number | undefined
): PlanDepthPrices {
  const typeIds = [...needs.keys()].sort((a, b) => a - b);
  const booksKey = typeIds.join(',');
  const regionId = hub.regionId;
  // A new loader (types, region or price refresh) re-reads behind the books already held.
  const loader = useCallback(
    () => loadBooks(regionId, booksKey === '' ? [] : booksKey.split(',').map(Number)),
    // `pricesFetchedAt` is the caller's "read again" signal: a new loader re-runs the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regionId, booksKey, pricesFetchedAt]
  );
  const { data: books = null } = useKeyedLoad(String(regionId), loader, booksKey === '');
  const walk = useCallback(
    (wanted: ReadonlyMap<number, number>) =>
      books && wanted.size > 0 ? walkBooks(books, hub.stationId, wanted) : NO_DEPTH_PRICES,
    [books, hub.stationId]
  );
  const depth = useMemo(() => walk(needs), [walk, needs]);
  return { depth, walk };
}
