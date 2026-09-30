/**
 * Order Detail's loading: every on-demand cache behind the Order Detail
 * modal, and the loaders that fill them.
 *
 * Split in two because the caches outlive any one modal. `useOrderDetail`
 * runs once per page, for the page's lifetime: the modal remounts per order
 * (and unmounts on close), and reopening an order must not refetch what is
 * already in hand. The region and structure books also reclassify the
 * worklist's own rows, and the group "check system and region" button fills
 * the same region-book cache. `useOpenOrderDetail` runs inside the modal, for
 * the one order on screen: it asks for what that order needs and assembles
 * its view.
 */
import { useContext, useEffect, useLayoutEffect, useMemo } from 'react';
import { useRouteQuery } from '@/features/route/routeRules';
import { useLazyRowCache } from '@/lib/useLazyRowCache';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { TRADE_HUBS } from '@/market/hubs';
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

/**
 * The refine comparison for one item at one station. Keyed by station AND
 * item, not by item alone: the material prices are the ones at THIS
 * station, and the same item held at two stations refines into materials
 * worth different amounts. An item with no reprocessing entry answers with
 * an empty materials list rather than failing — "this refines into nothing"
 * is an answer.
 */
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
      // The best BUY order: this exit sells the materials into orders that
      // already exist, rather than listing them and waiting.
      const buyMax = prices.get(stationPriceKey(locationId, materialTypeId))?.buyMax;
      if (buyMax !== null && buyMax !== undefined) materialPrices[materialTypeId] = buyMax;
    }
  }
  return { entry, materialPrices };
}

/**
 * What every trade hub bids for one item. Queried per hub STATION, not per
 * region: a buy order elsewhere in the hub's region carries a range this app
 * does not read and may not reach the hub at all, the same restriction
 * `orderExits` applies to the player's own station.
 */
async function loadHubBids(loaders: OrderDetailLoaders, typeId: number): Promise<HubBids> {
  const prices = await loaders.stationBestPrices(
    TRADE_HUBS.map((hub) => ({ stationId: hub.stationId, typeIds: [typeId] }))
  );
  const byHub: Record<string, number | null> = {};
  for (const hub of TRADE_HUBS) {
    byHub[hub.id] = prices.get(stationPriceKey(hub.stationId, typeId))?.buyMax ?? null;
  }
  return byHub;
}

/** The page's one Order Detail: its caches, and the loads the modal and the worklist ask for. */
export interface OrderDetail {
  caches: OrderDetailCacheContents;
  /** Loads what opening this order needs: its region book, price history, refine comparison and hub bids. */
  loadOnOpen: (row: OpenOrderRow) => void;
  /** Loads the route between two solar systems. */
  loadRoute: (fromSystemId: number, toSystemId: number) => void;
  /** Loads a player structure's own book, once — a failure stays failed until `retryStructure`. */
  loadStructure: (characterId: number, locationId: number) => void;
  /** Re-arms a structure that failed, and asks again. */
  retryStructure: (characterId: number, locationId: number) => void;
  /**
   * The group header's "check system and region": the region book for every
   * DISTINCT item among `rows` (several characters can each hold an order on
   * the same item), at most `ESI_FANOUT_CONCURRENCY` at a time — a large
   * "expiring or stale" group can easily hold dozens of distinct items.
   */
  checkDeeper: (rows: readonly OpenOrderRow[]) => void;
}

export function useOrderDetail(): OrderDetail {
  const loaders = useContext(OrderDetailLoadersContext);
  /**
   * Region order books, keyed by region+item. Also reclassify the
   * worklist's own rows, so the panel reads them too.
   */
  const regionBooks = useLazyRowCache<string, RegionCompetition>();
  /**
   * One player structure's market book, keyed by locationId — every order
   * parked at that structure, of any type or character, shares one fetch.
   * Absent means "never attempted or still failing"; `buildOpenOrderRows`
   * and the modal both read that absence as "unavailable", same as an
   * ungranted scope or an ACL denial. Loaded `sticky`: an ACL-denied (403)
   * structure must not retry on every unrelated snapshot revalidation while
   * the modal stays open — only the modal's "Check deeper" button forces
   * another attempt.
   */
  const structureBooks = useLazyRowCache<number, StructureCompetition>();
  /** Price history for the "sells out in" chip, keyed by region+item. Left uncached on failure so the next open retries. */
  const history = useLazyRowCache<string, PriceHistoryResult>();
  /**
   * Loaded only when a modal opens — `reprocessing.json` is 1.4 MB and no
   * row on the worklist needs it. Left uncached on failure so the next open
   * retries.
   */
  const refine = useLazyRowCache<string, RefineQuote>();
  /**
   * Keyed by type id alone: a hub's own buy orders do not change with where
   * the player's stock happens to sit, unlike the refine prices above.
   */
  const hubBids = useLazyRowCache<number, HubBids>();
  /** Jump distance, keyed by `"system:system"` — shared by the region-rival route and the trade-hub sweep. */
  const jumps = useLazyRowCache<string, JumpsAwayResult>();
  // Loaded under the Travel Settings in force, and read back only for those:
  // a distance worked out under other rules is not this one.
  const { rules: routeRules, key: routeKey, hydrated: routeHydrated } = useRouteQuery();
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

  // Only each cache's `load`/`reset` are read below, and those alone are
  // stable for the life of its `useLazyRowCache` call — the cache objects
  // themselves are fresh every render.
  const loadRegionBook = regionBooks.load;
  const loadStructureBook = structureBooks.load;
  const resetStructureBook = structureBooks.reset;
  const loadHistory = history.load;
  const loadRefine = refine.load;
  const loadHubBidsFor = hubBids.load;
  const loadJumps = jumps.load;

  // Every action is stable for as long as the loaders are — kept apart from
  // `caches`, which changes on every fetch, so an effect keyed on an action
  // does not re-fire (and retry a failed load) whenever any cache fills.
  const actions = useMemo<Omit<OrderDetail, 'caches'>>(() => {
    const loadRegion = (regionId: number, typeId: number) =>
      loadRegionBook(itemKey(regionId, typeId), () => loaders.regionCompetition(regionId, typeId));

    // `loadStructureCompetition` never throws (a 403/network failure resolves
    // to `null`), so a `null` is turned into a rejection here: the `sticky`
    // option is what stops a repeat attempt, but a rejection is what marks
    // it failed, sharing the "unavailable" shape of a genuine fetch error.
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
      // `load`'s own synchronous dedup is what keeps a sweep of several
      // routes from re-asking for one already requested (its doc comment).
      loadRoute: (fromSystemId, toSystemId) => {
        // Not until the Travel Settings are in: a jump count asked on defaults is
        // one the pilot's rules would not give. Hydrating re-creates this action,
        // so the effects that call it ask again.
        if (!routeHydrated) return;
        void loadJumps(`${jumpsKey(fromSystemId, toSystemId)}|${routeKey}`, () =>
          loaders.jumpsBetween(fromSystemId, toSystemId, routeRules)
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
        // Each worker picks up its next item only once the current one's
        // promise settles — which is exactly what caps the fan-out.
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
    routeRules,
    routeHydrated,
  ]);

  return useMemo(() => ({ ...actions, caches }), [actions, caches]);
}

/**
 * One open order's view, and its "Check deeper" button — loading what the
 * order needs while it is open. Called by the Order Detail modal.
 */
export function useOpenOrderDetail(
  detail: OrderDetail,
  row: OpenOrderRow,
  snapshot: OrderDetailSnapshot
): { view: OrderDetailView; checkDeeper: () => void } {
  const { loadOnOpen, loadRoute, loadStructure } = detail;

  // A layout effect, so the loads start before the modal's first paint — as
  // they did when the Details click itself fired them — and it never flashes
  // "Refresh system & region prices" for a check already on its way.
  useLayoutEffect(() => {
    loadOnOpen(row);
    // Once per opened order, as the Details click used to: an order's region,
    // item and location never change, so a newer copy of the same row (a
    // snapshot refresh) must not re-fire the loads — nor retry a failed one.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `row` itself is deliberately left out; see above.
  }, [loadOnOpen, row.regionId, row.typeId, row.locationId]);

  // The route to the region rival, once one exists — which is only after the
  // region book lands and the panel hands over a reclassified row.
  useEffect(() => {
    const rival = row.deepUndercut?.byScope.region;
    const mySystemId = orderSystemId(row, snapshot);
    if (!rival || mySystemId === undefined) return;
    loadRoute(mySystemId, rival.systemId);
  }, [row, snapshot, loadRoute]);

  // Distance from the opened order to every trade hub. Routes only: a hub's
  // price stands on its own where the origin system is unknown (a player
  // structure), so the rows render with the distance blank rather than not
  // at all. Re-runs on every newer row or snapshot: the station lookup can
  // land after the modal opens.
  useEffect(() => {
    const mySystemId = orderSystemId(row, snapshot);
    if (mySystemId === undefined) return;
    for (const hub of TRADE_HUBS) loadRoute(mySystemId, hub.systemId);
  }, [row, snapshot, loadRoute]);

  /*
   * The order's structure market book (issue #538), once its location is
   * confirmed a player structure. An effect, not a load on open: the
   * NPC-station lookup can still be loading (or have failed) when the modal
   * opens — `stationsLoaded` false at that instant — and only resolve on a
   * later snapshot. The snapshot changes on ANY unrelated ESI cache
   * revalidating elsewhere in the app, so this fires far more often than
   * "this row's data changed" — fine, since `loadStructure`'s sticky load
   * makes every re-fire after the first a no-op, which is what stops a
   * permanently ACL-denied structure from being retried forever.
   */
  useEffect(() => {
    if (!snapshot.stationsLoaded || row.stationName !== null) return;
    loadStructure(row.characterId, row.locationId);
  }, [row, snapshot, loadStructure]);

  return {
    view: assembleOrderDetailView(row, snapshot, detail.caches),
    checkDeeper: () => {
      detail.checkDeeper([row]);
      // A manual retry forces a new attempt past the structure's sticky
      // gate, unlike the effect above.
      if (row.stationName === null && snapshot.stationsLoaded) {
        detail.retryStructure(row.characterId, row.locationId);
      }
    },
  };
}
