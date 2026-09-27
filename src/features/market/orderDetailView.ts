/**
 * Order Detail's view assembly: what the loaded caches hold for one order,
 * turned into everything the Order Detail modal shows beyond the row itself.
 * Pure — the caches live in `useOrderDetail`, the fetches behind them in
 * `orderDetailLoaders`.
 */
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { salesTax } from '@/engine/industry/fees';
import { TRADE_HUBS } from '@/market/hubs';
import type { ReprocessingType } from '@/sde/types';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';
import type { CharacterSkills, OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { HubBuyPrice, ReprocessingInput } from './orderExits';
import type { PriceHistoryResult } from './priceHistory';
import { stationPriceKey } from './stationPriceKey';

/** The slice of the Open Orders snapshot Order Detail reads. */
export type OrderDetailSnapshot = Pick<
  OpenOrdersPageSnapshot,
  'npcStations' | 'stationsLoaded' | 'stationPrices' | 'skillsByCharacter'
>;

/** What each trade hub bids for one item, by hub id — null where the hub has no buy order. */
export type HubBids = Readonly<Record<string, number | null>>;

/**
 * The refine comparison's loaded half for one item at one station: the
 * baked yield plus a price for each material AT THAT STATION.
 */
export interface RefineQuote {
  entry: ReprocessingType;
  materialPrices: Readonly<Record<number, number>>;
}

/** Every Order Detail cache's contents, as `useOrderDetail` holds them. */
export interface OrderDetailCacheContents {
  /** Region order books by `itemKey(regionId, typeId)`. */
  regionBooks: ReadonlyMap<string, RegionCompetition>;
  regionBooksLoading: ReadonlySet<string>;
  /** Player structures' market books by location id. */
  structureBooks: ReadonlyMap<number, StructureCompetition>;
  /** Jump distance between two solar systems, by `jumpsKey`. */
  jumps: ReadonlyMap<string, JumpsAwayResult>;
  /** Refine quotes by `stationPriceKey(locationId, typeId)`. */
  refine: ReadonlyMap<string, RefineQuote>;
  /** Hub bids by type id. */
  hubBids: ReadonlyMap<number, HubBids>;
  hubBidsFailed: ReadonlySet<number>;
  /** Price history by `itemKey(regionId, typeId)`. */
  history: ReadonlyMap<string, PriceHistoryResult>;
}

export const EMPTY_ORDER_DETAIL_CACHES: OrderDetailCacheContents = {
  regionBooks: new Map(),
  regionBooksLoading: new Set(),
  structureBooks: new Map(),
  jumps: new Map(),
  refine: new Map(),
  hubBids: new Map(),
  hubBidsFailed: new Set(),
  history: new Map(),
};

/** The two fees between cost per unit and the relist floor, in ISK per unit. */
export interface RelistFees {
  salesTax: number;
  /** Relist Discount already applied. */
  brokerFee: number;
}

/** Everything the Order Detail modal shows beyond the row itself. */
export interface OrderDetailView {
  /** This order's region book. Null: not fetched yet (or the fetch failed and hasn't been retried). */
  deep: RegionCompetition | null;
  loadingDeep: boolean;
  /**
   * Null: not fetched yet (or the fetch failed and hasn't been retried) —
   * renders the same honest "can't tell yet" as no history at all, since
   * neither case can support a number.
   */
  history: PriceHistoryResult | null;
  /** Whether the cheap station-price tier actually returned an aggregate for this row's station+item. */
  stationChecked: boolean;
  /**
   * Whether the NPC-station lookup itself loaded. False (e.g. a first
   * offline visit — that file is deliberately outside the install precache)
   * must read as "not checked" for station/system, never as the false claim
   * that this order sits at a player structure.
   */
  stationsLoaded: boolean;
  /** Route to the region rival. Undefined while not yet requested/resolved. */
  regionJumps: JumpsAwayResult | undefined;
  /** Resolves a rival's location to a name, so the three scopes can be told apart when they quote the same seller. Returns null for a player structure. */
  stationNameFor: (locationId: number) => string | null;
  /**
   * This order's own structure's market book (issue #538), when this is a
   * player structure and that book has been fetched. Null for every reason
   * the station scope can't answer here: not a structure, no fetch attempted
   * yet, the `structureMarkets` scope isn't granted, or this character isn't
   * on the structure's ACL — all render as the same "unavailable" row.
   */
  structureMarket: StructureCompetition | null;
  /** The refine comparison, once its yield and material prices have loaded and the owner's skills are known. Undefined keeps the row greyed as "not built for this item yet". */
  reprocessing: ReprocessingInput | undefined;
  /**
   * What each trade hub pays for this item, once the bids land. Undefined
   * until then — distinct from an empty list, which is the real answer that
   * no hub bids at all.
   */
  hubs: readonly HubBuyPrice[] | undefined;
  /** The hub lookup failed. Says so, rather than leaving "checking…" standing forever. */
  hubsFailed: boolean;
  /** The cost-basis ledger's fee lines at the relist floor — null without a floor, a cost basis, or the owner's skills (the ledger then drops them). */
  relistFees: RelistFees | null;
}

/** The region-book and price-history caches' key for one item in one region. */
export function itemKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

/** The jumps cache's key for a route between two solar systems. */
export function jumpsKey(fromSystemId: number, toSystemId: number): string {
  return `${fromSystemId}:${toSystemId}`;
}

/** The system this order sits in, when the NPC-station lookup knows it — never for a player structure. */
export function orderSystemId(
  row: OpenOrderRow,
  snapshot: OrderDetailSnapshot
): number | undefined {
  return snapshot.npcStations.get(row.locationId)?.systemId;
}

/**
 * Read as ISK off `floor.relist`, not as a bare percentage:
 * `unitCost + salesTax(relist) + brokerFeePerUnit === relist` by
 * construction (`relistBreakEvenPrice` solves for exactly that revenue),
 * including its 100 ISK minimum-broker-fee floor — which a
 * percentage-of-unitCost readout would silently miss.
 *
 * Broker fee is the ledger's remainder (`relist - unitCost - salesTax`), not
 * a re-derived `relistFee(relist, relist, 1, ...)`: `relist` is already a
 * PER-UNIT price, and re-solving the fee at quantity 1 would re-apply its
 * own 100 ISK minimum to that single unit, silently reintroducing the
 * per-unit minimum this floor removes for large remaining-quantity stacks
 * (#1224). The remainder already carries whatever Relist Discount
 * `relistBreakEvenPrice` applied when it solved `relist`.
 */
export function relistFees(
  row: OpenOrderRow,
  skills: CharacterSkills | undefined
): RelistFees | null {
  if (!skills || !row.floor || !row.costBasis) return null;
  const tax = salesTax(row.floor.relist, skills.accountingLevel);
  return { salesTax: tax, brokerFee: row.floor.relist - row.costBasis.unitCost - tax };
}

/** Cache contents for one order → everything the Order Detail modal shows beyond the row. */
export function assembleOrderDetailView(
  row: OpenOrderRow,
  snapshot: OrderDetailSnapshot,
  caches: OrderDetailCacheContents
): OrderDetailView {
  const item = itemKey(row.regionId, row.typeId);
  const mySystemId = orderSystemId(row, snapshot);
  const rival = row.deepUndercut?.byScope.region;
  const skills = snapshot.skillsByCharacter.get(row.characterId);
  const refine = caches.refine.get(stationPriceKey(row.locationId, row.typeId));
  const byHub = caches.hubBids.get(row.typeId);
  const routeTo = (systemId: number) =>
    mySystemId === undefined ? undefined : caches.jumps.get(jumpsKey(mySystemId, systemId));
  return {
    deep: caches.regionBooks.get(item) ?? null,
    loadingDeep: caches.regionBooksLoading.has(item),
    history: caches.history.get(item) ?? null,
    stationChecked: snapshot.stationPrices.has(stationPriceKey(row.locationId, row.typeId)),
    stationsLoaded: snapshot.stationsLoaded,
    regionJumps: rival ? routeTo(rival.systemId) : undefined,
    stationNameFor: (locationId) => snapshot.npcStations.get(locationId)?.name ?? null,
    structureMarket: caches.structureBooks.get(row.locationId) ?? null,
    reprocessing:
      refine && skills
        ? {
            entry: refine.entry,
            materialPrices: refine.materialPrices,
            modifiers: skills.modifiers,
          }
        : undefined,
    hubs: byHub
      ? TRADE_HUBS.map((hub) => ({
          hubId: hub.id,
          systemName: hub.systemName,
          stationId: hub.stationId,
          buyMax: byHub[hub.id] ?? null,
          jumps: routeTo(hub.systemId),
        }))
      : undefined,
    hubsFailed: caches.hubBidsFailed.has(row.typeId),
    relistFees: relistFees(row, skills),
  };
}
