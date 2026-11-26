import { useCallback, useMemo } from 'react';
import { depthCandidates, walkSellBook, type DepthPrice } from '@/engine/industry/depthPrice';
import type { BuildResult, HubPrices } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { shoppingListMaterials } from './subBuildPlan';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { TradeHub } from '@/market/hubs';
import { getOrderBook, ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';

export type DepthPrices = ReadonlyMap<number, DepthPrice>;
type Books = ReadonlyMap<number, readonly HubOrder[]>;

const NO_DEPTH_PRICES: DepthPrices = new Map();

export async function loadBooks(regionId: number, typeIds: readonly number[]): Promise<Books> {
  const books = new Map<number, readonly HubOrder[]>();
  await mapWithConcurrencyLimit(typeIds, ORDER_BOOK_FANOUT_CONCURRENCY, async (typeID) => {
    try {
      books.set(typeID, (await getOrderBook(regionId, typeID)).orders);
    } catch {}
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

export function planDepthNeeds(
  plan: Pick<BuildPlanRecord, 'materialSourcing' | 'materialPriceBasis'>,
  lowestSell: Pick<BuildResult, 'materials'> | null,
  sellVolumes: HubPrices
): Map<number, number> {
  return lowestSell
    ? depthCandidates(
        shoppingListMaterials(lowestSell.materials),
        sellVolumes,
        plan.materialSourcing,
        plan.materialPriceBasis
      )
    : new Map<number, number>();
}

export async function loadDepthPrices(
  hub: Pick<TradeHub, 'regionId' | 'stationId'>,
  needs: ReadonlyMap<number, number>
): Promise<Map<number, DepthPrice>> {
  return walkBooks(await loadBooks(hub.regionId, [...needs.keys()]), hub.stationId, needs);
}

export interface PlanDepthPrices {
  depth: DepthPrices;
  walk: (needs: ReadonlyMap<number, number>) => DepthPrices;
}

export function useDepthPrices(
  hub: TradeHub,
  needs: ReadonlyMap<number, number>,
  pricesFetchedAt: number | undefined
): PlanDepthPrices {
  const typeIds = [...needs.keys()].sort((a, b) => a - b);
  const booksKey = typeIds.join(',');
  const regionId = hub.regionId;
  const loader = useCallback(
    () => loadBooks(regionId, booksKey === '' ? [] : booksKey.split(',').map(Number)),
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
