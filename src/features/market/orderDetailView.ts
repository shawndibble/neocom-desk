import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import { salesTax } from '@/engine/industry/fees';
import { COMPARED_HUBS } from '@/market/hubs';
import type { ReprocessingType } from '@/sde/types';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';
import type { CharacterSkills, OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { OrderAdvice } from './orderAdvice';
import type { HubBuyPrice, ReprocessingInput } from './orderExits';
import type { PriceHistoryResult } from './priceHistory';
import { stationPriceKey } from './stationPriceKey';

export type OrderDetailSnapshot = Pick<
  OpenOrdersPageSnapshot,
  'npcStations' | 'stationsLoaded' | 'stationPrices' | 'skillsByCharacter'
>;

export type HubBids = Readonly<Record<string, number | null>>;

export interface RefineQuote {
  entry: ReprocessingType;
  materialPrices: Readonly<Record<number, number>>;
}

export interface OrderDetailCacheContents {
  regionBooks: ReadonlyMap<string, RegionCompetition>;
  regionBooksLoading: ReadonlySet<string>;
  structureBooks: ReadonlyMap<number, StructureCompetition>;
  jumps: ReadonlyMap<string, JumpsAwayResult>;
  refine: ReadonlyMap<string, RefineQuote>;
  hubBids: ReadonlyMap<number, HubBids>;
  hubBidsFailed: ReadonlySet<number>;
  history: ReadonlyMap<string, PriceHistoryResult>;
}

export interface RelistFees {
  salesTax: number;
  brokerFee: number;
}

export interface OrderDetailView {
  deep: RegionCompetition | null;
  loadingDeep: boolean;
  history: PriceHistoryResult | null;
  stationChecked: boolean;
  stationsLoaded: boolean;
  regionJumps: JumpsAwayResult | undefined;
  stationNameFor: (locationId: number) => string | null;
  structureMarket: StructureCompetition | null;
  reprocessing: ReprocessingInput | undefined;
  hubs: readonly HubBuyPrice[] | undefined;
  hubsFailed: boolean;
  relistFees: RelistFees | null;
  accountingLevel?: number;
}

export function itemKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

export function jumpsKey(fromSystemId: number, toSystemId: number): string {
  return `${fromSystemId}:${toSystemId}`;
}

export function orderSystemId(
  row: OpenOrderRow,
  snapshot: OrderDetailSnapshot
): number | undefined {
  return snapshot.npcStations.get(row.locationId)?.systemId;
}

export function relistFees(
  row: OpenOrderRow,
  skills: CharacterSkills | undefined
): RelistFees | null {
  if (!skills || !row.floor || !row.costBasis) return null;
  const tax = salesTax(row.floor.relist, skills.accountingLevel, row.floor.feeDiscountFactor);
  return { salesTax: tax, brokerFee: row.floor.relist - row.costBasis.unitCost - tax };
}

export interface VerdictFigures {
  copyPrice: number | null;
  keepPerUnit: number | null;
}

export function verdictFigures(row: OpenOrderRow, advice: OrderAdvice): VerdictFigures {
  const { summary, verdict } = advice;
  const copyPrice =
    (verdict?.kind === 'raisePrice' || verdict?.kind === 'matchThem') && verdict.price !== null
      ? verdict.price
      : row.isBuyOrder && summary?.kind === 'outbid'
        ? summary.suggestedPrice
        : null;
  const keepPerUnit =
    row.isBuyOrder || !row.floor
      ? null
      : verdict?.kind === 'matchThem' && verdict.amount !== null
        ? verdict.amount
        : verdict?.kind === 'raisePrice'
          ? row.price - row.floor.relist
          : row.price - row.floor.fill;
  return { copyPrice, keepPerUnit };
}

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
      ? COMPARED_HUBS.map((hub) => ({
          hubId: hub.id,
          systemName: hub.systemName,
          stationId: hub.stationId,
          buyMax: byHub[hub.id] ?? null,
          jumps: routeTo(hub.systemId),
        }))
      : undefined,
    hubsFailed: caches.hubBidsFailed.has(row.typeId),
    relistFees: relistFees(row, skills),
    accountingLevel: skills?.accountingLevel,
  };
}
