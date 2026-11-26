import { useContext, useEffect, useLayoutEffect, useMemo } from 'react';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { useLazyRowCache } from '@/lib/useLazyRowCache';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import { COMPARED_HUBS } from '@/market/hubs';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { OpenOrderRow } from './openOrdersModel';
import type { PriceHistoryResult } from './priceHistory';
import { OrderDetailLoadersContext, type OrderDetailLoaders } from './orderDetailLoaders';
import { stationPriceKey } from './stationPriceKey';
import {
  assembleOrderDetailView,
  itemKey,
  jumpsKey,
  orderSystemId,
  type HubBids,
  type OrderDetailCacheContents,
  type OrderDetailSnapshot,
  type OrderDetailView,
  type RefineQuote,
} from './orderDetailView';

async function loadRefineQuote(
  loaders: OrderDetailLoaders,
  locationId: number,
  typeId: number
): Promise<RefineQuote> {
  const map = await loaders.reprocessing();
  const entry = map[String(typeId)] ?? { portionSize: 1, materials: [] };
  const materialTypeIds = entry.materials.map((m) => m.typeID);
  const materialPrices: Record<number, number> = {};
  if (materialTypeIds.length > 0) {
    const prices = await loaders.stationBestPrices([
      { stationId: locationId, typeIds: materialTypeIds },
    ]);
    for (const materialTypeId of materialTypeIds) {
      const buyMax = prices.get(stationPriceKey(locationId, materialTypeId))?.buyMax;
      if (buyMax !== null && buyMax !== undefined) materialPrices[materialTypeId] = buyMax;
    }
  }
  return { entry, materialPrices };
}

async function loadHubBids(loaders: OrderDetailLoaders, typeId: number): Promise<HubBids> {
  const prices = await loaders.stationBestPrices(
    COMPARED_HUBS.map((hub) => ({ stationId: hub.stationId, typeIds: [typeId] }))
  );
  const byHub: Record<string, number | null> = {};
  for (const hub of COMPARED_HUBS) {
    byHub[hub.id] = prices.get(stationPriceKey(hub.stationId, typeId))?.buyMax ?? null;
  }
  return byHub;
}

export interface OrderDetail {
  caches: OrderDetailCacheContents;
  loadOnOpen: (row: OpenOrderRow) => void;
  loadRoute: (fromSystemId: number, toSystemId: number) => void;
  loadStructure: (characterId: number, locationId: number) => void;
  retryStructure: (characterId: number, locationId: number) => void;
  checkDeeper: (rows: readonly OpenOrderRow[]) => void;
}

export function useOrderDetail(): OrderDetail {
  const loaders = useContext(OrderDetailLoadersContext);
  const regionBooks = useLazyRowCache<string, RegionCompetition>();
  const structureBooks = useLazyRowCache<number, StructureCompetition>();
  const history = useLazyRowCache<string, PriceHistoryResult>();
  const refine = useLazyRowCache<string, RefineQuote>();
  const hubBids = useLazyRowCache<number, HubBids>();
  const jumps = useLazyRowCache<string, JumpsAwayResult>();
  const { rules, network, key: routeKey, hydrated: routeHydrated } = useJumpBasis();
  const routeBasis = useMemo(() => ({ rules, network }), [rules, network]);
  const jumpsForList = useMemo(() => {
    const suffix = `|${routeKey}`;
    const view = new Map<string, JumpsAwayResult>();
    for (const [key, value] of jumps.byKey) {
      if (key.endsWith(suffix)) view.set(key.slice(0, -suffix.length), value);
    }
    return view;
  }, [jumps.byKey, routeKey]);

  const caches = useMemo<OrderDetailCacheContents>(
    () => ({
      regionBooks: regionBooks.byKey,
      regionBooksLoading: regionBooks.loadingKeys,
      structureBooks: structureBooks.byKey,
      history: history.byKey,
      refine: refine.byKey,
      hubBids: hubBids.byKey,
      hubBidsFailed: hubBids.failedKeys,
      jumps: jumpsForList,
    }),
    [
      regionBooks.byKey,
      regionBooks.loadingKeys,
      structureBooks.byKey,
      history.byKey,
      refine.byKey,
      hubBids.byKey,
      hubBids.failedKeys,
      jumpsForList,
    ]
  );

  const loadRegionBook = regionBooks.load;
  const loadStructureBook = structureBooks.load;
  const resetStructureBook = structureBooks.reset;
  const loadHistory = history.load;
  const loadRefine = refine.load;
  const loadHubBidsFor = hubBids.load;
  const loadJumps = jumps.load;

  const actions = useMemo<Omit<OrderDetail, 'caches'>>(() => {
    const loadRegion = (regionId: number, typeId: number) =>
      loadRegionBook(itemKey(regionId, typeId), () => loaders.regionCompetition(regionId, typeId));

    const loadStructure = (characterId: number, locationId: number) => {
      void loadStructureBook(
        locationId,
        async () => {
          const result = await loaders.structureCompetition(characterId, locationId);
          if (!result) throw new Error('Structure market unavailable');
          return result;
        },
        { sticky: true }
      );
    };

    return {
      loadOnOpen: (row) => {
        void loadRegion(row.regionId, row.typeId);
        void loadHistory(itemKey(row.regionId, row.typeId), () =>
          loaders.priceHistory(row.regionId, row.typeId)
        );
        void loadRefine(stationPriceKey(row.locationId, row.typeId), () =>
          loadRefineQuote(loaders, row.locationId, row.typeId)
        );
        void loadHubBidsFor(row.typeId, () => loadHubBids(loaders, row.typeId));
      },
      loadRoute: (fromSystemId, toSystemId) => {
        if (!routeHydrated) return;
        void loadJumps(`${jumpsKey(fromSystemId, toSystemId)}|${routeKey}`, () =>
          loaders.jumpsBetween(fromSystemId, toSystemId, routeBasis)
        );
      },
      loadStructure,
      retryStructure: (characterId, locationId) => {
        resetStructureBook(locationId);
        loadStructure(characterId, locationId);
      },
      checkDeeper: (rows) => {
        const seen = new Set<string>();
        const uniqueRows: OpenOrderRow[] = [];
        for (const row of rows) {
          const key = itemKey(row.regionId, row.typeId);
          if (seen.has(key)) continue;
          seen.add(key);
          uniqueRows.push(row);
        }
        void mapWithConcurrencyLimit(uniqueRows, ESI_FANOUT_CONCURRENCY, (row) =>
          loadRegion(row.regionId, row.typeId)
        );
      },
    };
  }, [
    loaders,
    loadRegionBook,
    loadStructureBook,
    resetStructureBook,
    loadHistory,
    loadRefine,
    loadHubBidsFor,
    loadJumps,
    routeKey,
    routeBasis,
    routeHydrated,
  ]);

  return useMemo(() => ({ ...actions, caches }), [actions, caches]);
}

export function useOpenOrderDetail(
  detail: OrderDetail,
  row: OpenOrderRow,
  snapshot: OrderDetailSnapshot
): { view: OrderDetailView; checkDeeper: () => void } {
  const { loadOnOpen, loadRoute, loadStructure } = detail;

  useLayoutEffect(() => {
    loadOnOpen(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `row` itself is deliberately left out; see above.
  }, [loadOnOpen, row.regionId, row.typeId, row.locationId]);

  useEffect(() => {
    const rival = row.deepUndercut?.byScope.region;
    const mySystemId = orderSystemId(row, snapshot);
    if (!rival || mySystemId === undefined) return;
    loadRoute(mySystemId, rival.systemId);
  }, [row, snapshot, loadRoute]);

  useEffect(() => {
    const mySystemId = orderSystemId(row, snapshot);
    if (mySystemId === undefined) return;
    for (const hub of COMPARED_HUBS) loadRoute(mySystemId, hub.systemId);
  }, [row, snapshot, loadRoute]);

  useEffect(() => {
    if (!snapshot.stationsLoaded || row.stationName !== null) return;
    loadStructure(row.characterId, row.locationId);
  }, [row, snapshot, loadStructure]);

  return {
    view: assembleOrderDetailView(row, snapshot, detail.caches),
    checkDeeper: () => {
      detail.checkDeeper([row]);
      if (row.stationName === null && snapshot.stationsLoaded) {
        detail.retryStructure(row.characterId, row.locationId);
      }
    },
  };
}
