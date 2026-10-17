/**
 * Loads Depth Prices (issue #3993): each candidate material's region Order
 * Book (`getOrderBook`, 300 s cache), walked at the hub station for the need.
 * Which materials are candidates is `depthCandidates`/`summedDepthNeeds`'
 * call — this only fetches and walks.
 *
 * A book that fails to load drops that material back to the lowest sell: an
 * Order Book outage must not leave a plan unpriced.
 */
import { useEffect, useMemo, useState } from 'react';
import { walkSellBook, type DepthPrice } from '@/engine/industry/depthPrice';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { TradeHub } from '@/market/hubs';
import { getOrderBook, ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';

export type DepthPrices = ReadonlyMap<number, DepthPrice>;

export const NO_DEPTH_PRICES: DepthPrices = new Map();

/** Each type's region Order Book; a type whose book failed to load is absent. */
async function loadBooks(
  regionId: number,
  typeIds: readonly number[]
): Promise<Map<number, readonly HubOrder[]>> {
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
  books: ReadonlyMap<number, readonly HubOrder[]>,
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

/**
 * The plan page's Depth Prices for `needs` at `hub`. Books are fetched per
 * set of types and walked on every need change, so editing runs re-prices
 * without a fetch. Empty until the books land (the plan shows lowest sells
 * meanwhile) and whenever there are no needs, which fetches nothing.
 */
export function useDepthPrices(hub: TradeHub, needs: ReadonlyMap<number, number>): DepthPrices {
  const typeIds = [...needs.keys()].sort((a, b) => a - b);
  const booksKey = `${hub.regionId}|${typeIds.join(',')}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    books: ReadonlyMap<number, readonly HubOrder[]>;
  } | null>(null);

  useEffect(() => {
    if (typeIds.length === 0) return;
    let cancelled = false;
    void loadBooks(hub.regionId, typeIds).then((books) => {
      if (!cancelled) setLoaded({ key: booksKey, books });
    });
    return () => {
      cancelled = true;
    };
    // `booksKey` carries the region and types by value; the arrays change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booksKey]);

  const books = loaded?.key === booksKey ? loaded.books : null;
  return useMemo(
    () => (books && needs.size > 0 ? walkBooks(books, hub.stationId, needs) : NO_DEPTH_PRICES),
    [books, hub.stationId, needs]
  );
}
