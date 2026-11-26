import type { OpenOrdersSnapshot, CharacterOpenOrders } from './openOrdersData';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { OrderCostBasis, WalletBasisGap } from './orderCostBasis';
import { stationPriceKey } from './stationPriceKey';
import type { HubAggregate } from '@/market/fuzzwork';
import type { MarketOrder } from '@/esi/endpoints';
import {
  findUndercut,
  type MyOrder,
  type CompetingOrder,
  type UndercutScope,
  type UndercutResult,
} from '@/engine/market/undercut';
import { orderFloor, type OrderFloor } from '@/engine/market/orderFloor';
import { structureBrokerPct } from '@/engine/market/structureFee';
import type { StructureFees } from '@/features/market/structureFees';
import type { ResolvedStandings } from '@/engine/market/standings';
import { orderExpiry, type OrderExpiry } from '@/engine/market/orderHealth';
import {
  wasFrequentlyUndercut,
  type OrderProblemSample,
} from '@/engine/market/orderProblemHistory';
import {
  worstProblem,
  allProblems,
  isRealProblem,
  ORDER_PROBLEMS,
  type OrderProblem,
  type OrderProblemFacts,
} from '@/engine/market/orderProblems';

export interface StructureCompetitor extends CompetingOrder {
  typeId: number;
}

export interface StationTier {
  bestPrice: number | null;
  beatsMe: boolean;
  gapIsk: number;
  gapPct: number;
  ownRival?: OwnRival;
}

export interface OwnRival {
  characterName: string;
  price: number;
}

export interface OpenOrderRow {
  orderId: number;
  characterId: number;
  characterName: string;
  typeId: number;
  typeName: string;
  isBuyOrder: boolean;
  price: number;
  volumeRemain: number;
  volumeTotal: number;
  locationId: number;
  regionId: number;
  stationName: string | null;
  issued: string;
  durationDays: number;
  expiry: OrderExpiry | null;
  floor: OrderFloor | null;
  costBasis: OrderCostBasis | null;
  walletGap?: WalletBasisGap | null;
  station: StationTier;
  ownRival?: OwnRival;
  deepUndercut: UndercutResult | null;
  worstScope: UndercutScope | null;
  problem: OrderProblem;
  problems: OrderProblem[];
  iskTiedUp: number;
  belowFloor: boolean;
  frequentlyUndercut: boolean;
  competitionUnchecked?: boolean;
  turnInEach?: number;
}

export interface CharacterSkills {
  accountingLevel: number;
  brokerRelationsLevel: number;
  advancedBrokerRelationsLevel: number;
  modifiers: CharacterModifiers;
}

export interface BuildRowsInput {
  snapshot: OpenOrdersSnapshot;
  typeNames: ReadonlyMap<number, string>;
  stationPrices: ReadonlyMap<string, HubAggregate>;
  costBases: ReadonlyMap<number, OrderCostBasis>;
  walletBasisGaps?: ReadonlyMap<number, WalletBasisGap>;
  deepCompetition?: ReadonlyMap<
    number,
    { competitors: readonly CompetingOrder[]; truncated: boolean }
  >;
  structureCompetition?: ReadonlyMap<
    number,
    { competitors: readonly StructureCompetitor[]; truncated: boolean }
  >;
  stationNames?: ReadonlyMap<number, string>;
  skillsByCharacter: ReadonlyMap<number, CharacterSkills>;
  standingsByOrder?: ReadonlyMap<number, ResolvedStandings>;
  structureFees?: StructureFees;
  now: number;
  daysWithoutSale?: ReadonlyMap<number, number>;
  problemSamples?: ReadonlyMap<number, readonly OrderProblemSample[]>;
  turnInPerItem?: ReadonlyMap<number, number>;
}

function buildStationTier(
  price: number,
  isBuyOrder: boolean,
  aggregate: HubAggregate | undefined,
  ownAtStation: readonly OwnListing[]
): StationTier {
  const bestPrice = aggregate ? (isBuyOrder ? aggregate.buyMax : aggregate.sellMin) : null;
  if (bestPrice === null) {
    return { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 };
  }
  const beatsPrice = isBuyOrder ? bestPrice > price : bestPrice < price;
  const gapIsk = Math.abs(bestPrice - price);
  const gapPct = price > 0 ? (gapIsk / price) * 100 : 0;
  const alt = beatsPrice ? ownAtStation.find((o) => o.price === bestPrice) : undefined;
  if (alt) {
    return {
      bestPrice,
      beatsMe: false,
      gapIsk,
      gapPct,
      ownRival: { characterName: alt.characterName, price: alt.price },
    };
  }
  return { bestPrice, beatsMe: beatsPrice, gapIsk, gapPct };
}

interface OwnListing {
  orderId: number;
  characterName: string;
  price: number;
}

interface OwnOrderIndex {
  byOrderId: ReadonlyMap<number, OwnListing>;
  bySlot: ReadonlyMap<string, readonly OwnListing[]>;
  ids: ReadonlySet<number>;
}

export function ownSlotKey(locationId: number, typeId: number, isBuyOrder: boolean): string {
  return `${locationId}:${typeId}:${isBuyOrder ? 'buy' : 'sell'}`;
}

function buildOwnOrderIndex(snapshot: OpenOrdersSnapshot): OwnOrderIndex {
  const byOrderId = new Map<number, OwnListing>();
  const bySlot = new Map<string, OwnListing[]>();
  for (const entry of snapshot.entries) {
    for (const order of entry.orders) {
      const listing: OwnListing = {
        orderId: order.order_id,
        characterName: entry.characterName,
        price: order.price,
      };
      byOrderId.set(order.order_id, listing);
      const key = ownSlotKey(order.location_id, order.type_id, order.is_buy_order ?? false);
      const list = bySlot.get(key);
      if (list) list.push(listing);
      else bySlot.set(key, [listing]);
    }
  }
  return { byOrderId, bySlot, ids: new Set(byOrderId.keys()) };
}

function deriveSystemId(
  orderId: number,
  locationId: number,
  competitors: readonly CompetingOrder[]
): number | null {
  for (const c of competitors) {
    if (c.orderId === orderId) return c.systemId;
  }
  for (const c of competitors) {
    if (c.locationId === locationId) return c.systemId;
  }
  return null;
}

function buildDeepUndercut(
  order: MarketOrder,
  isBuyOrder: boolean,
  competitors: readonly CompetingOrder[],
  ownOrderIds: ReadonlySet<number>
): UndercutResult {
  const systemId = deriveSystemId(order.order_id, order.location_id, competitors);
  const mine: MyOrder = {
    orderId: order.order_id,
    price: order.price,
    locationId: order.location_id,
    systemId: systemId ?? 0,
    isBuyOrder,
  };
  const scopesChecked: UndercutScope[] =
    systemId !== null ? ['station', 'system', 'region'] : ['station', 'region'];
  return findUndercut(mine, competitors, scopesChecked, ownOrderIds);
}

function findOwnRival(
  order: MarketOrder,
  isBuyOrder: boolean,
  own: OwnOrderIndex,
  competitors: readonly CompetingOrder[]
): OwnRival | undefined {
  let best: OwnListing | undefined;
  for (const c of competitors) {
    if (c.orderId === order.order_id || c.isBuyOrder !== isBuyOrder) continue;
    const listing = own.byOrderId.get(c.orderId);
    if (!listing) continue;
    const beats = isBuyOrder ? c.price > order.price : c.price < order.price;
    if (!beats) continue;
    if (!best || (isBuyOrder ? c.price > best.price : c.price < best.price)) {
      best = { ...listing, price: c.price };
    }
  }
  return best ? { characterName: best.characterName, price: best.price } : undefined;
}

function buildRow(
  entry: CharacterOpenOrders,
  order: MarketOrder,
  input: BuildRowsInput,
  own: OwnOrderIndex
): OpenOrderRow {
  const {
    typeNames,
    stationPrices,
    costBases,
    walletBasisGaps,
    deepCompetition,
    structureCompetition,
    stationNames,
    skillsByCharacter,
    now,
    daysWithoutSale,
    standingsByOrder,
    structureFees,
  } = input;

  const isBuyOrder = order.is_buy_order ?? false;
  const aggregate = stationPrices.get(stationPriceKey(order.location_id, order.type_id));
  const ownAtStation = (
    own.bySlot.get(ownSlotKey(order.location_id, order.type_id, isBuyOrder)) ?? []
  ).filter((o) => o.orderId !== order.order_id);
  const station = buildStationTier(order.price, isBuyOrder, aggregate, ownAtStation);

  const deepEntry = deepCompetition?.get(order.order_id) ?? null;
  const structureEntry = structureCompetition?.get(order.location_id) ?? null;
  const structureCompetitors = structureEntry
    ? structureEntry.competitors.filter((c) => c.typeId === order.type_id)
    : [];
  const deepUndercut =
    deepEntry || structureEntry
      ? buildDeepUndercut(
          order,
          isBuyOrder,
          [...(deepEntry?.competitors ?? []), ...structureCompetitors],
          own.ids
        )
      : null;
  const ownRival =
    findOwnRival(order, isBuyOrder, own, [
      ...(deepEntry?.competitors ?? []),
      ...structureCompetitors,
    ]) ?? station.ownRival;
  const deepTruncated = (deepEntry?.truncated ?? false) || (structureEntry?.truncated ?? false);

  const worstScope: UndercutScope | null =
    deepUndercut !== null
      ? (deepUndercut.worst?.scope ?? (deepTruncated && station.beatsMe ? 'station' : null))
      : station.beatsMe
        ? 'station'
        : null;

  const costBasis = costBases.get(order.order_id) ?? null;
  const skills = skillsByCharacter.get(entry.characterId);
  const standing = standingsByOrder?.get(order.order_id);
  const ownerPct = structureFees?.[order.location_id];
  const floor =
    costBasis && skills
      ? orderFloor({
          unitCost: costBasis.unitCost,
          remainingQuantity: order.volume_remain,
          accountingLevel: skills.accountingLevel,
          brokerRelationsLevel: skills.brokerRelationsLevel,
          advancedBrokerRelationsLevel: skills.advancedBrokerRelationsLevel,
          factionStanding: standing?.factionStanding,
          corpStanding: standing?.corpStanding,
          feeDiscountFactor: standing?.feeDiscountFactor,
          structureBrokerPct: ownerPct === undefined ? undefined : structureBrokerPct(ownerPct),
        })
      : null;

  const belowFloor = floor !== null && !isBuyOrder && order.price < floor.relist;

  const expiry = orderExpiry(order.issued, order.duration, now);
  const turnInEach = input.turnInPerItem?.get(order.type_id);

  const facts: OrderProblemFacts = {
    isBuyOrder,
    belowFloor,
    undercutScope: worstScope,
    daysLeft: expiry?.daysLeft ?? null,
    volumeRemain: order.volume_remain,
    daysWithoutSale: daysWithoutSale?.get(order.order_id) ?? null,
    outlastsOrder: false,
    turnInBeatsPrice: turnInEach !== undefined && turnInEach > order.price,
  };
  const problem = worstProblem(facts);
  const problems = allProblems(facts);

  return {
    orderId: order.order_id,
    characterId: entry.characterId,
    characterName: entry.characterName,
    typeId: order.type_id,
    typeName: typeNames.get(order.type_id) ?? `Type #${order.type_id}`,
    isBuyOrder,
    price: order.price,
    volumeRemain: order.volume_remain,
    volumeTotal: order.volume_total,
    locationId: order.location_id,
    regionId: order.region_id,
    stationName: stationNames?.get(order.location_id) ?? null,
    issued: order.issued,
    durationDays: order.duration,
    expiry,
    floor,
    costBasis,
    walletGap: costBasis ? null : (walletBasisGaps?.get(order.order_id) ?? null),
    station,
    ...(ownRival ? { ownRival } : {}),
    deepUndercut,
    worstScope,
    problem,
    problems,
    iskTiedUp: order.price * order.volume_remain,
    belowFloor,
    frequentlyUndercut:
      problem === 'healthy' &&
      wasFrequentlyUndercut(input.problemSamples?.get(order.order_id) ?? [], input.now),
    competitionUnchecked: aggregate === undefined && deepUndercut === null,
    ...(turnInEach !== undefined ? { turnInEach } : {}),
  };
}

export function problemRank(problem: OrderProblem): number {
  return ORDER_PROBLEMS.indexOf(problem);
}

export function compareOpenOrderRowsWorstFirst(a: OpenOrderRow, b: OpenOrderRow): number {
  const rankDiff = problemRank(a.problem) - problemRank(b.problem);
  if (rankDiff !== 0) return rankDiff;
  if (b.iskTiedUp !== a.iskTiedUp) return b.iskTiedUp - a.iskTiedUp;
  return a.orderId - b.orderId;
}

export function buildOpenOrderRows(input: BuildRowsInput): OpenOrderRow[] {
  const rows: OpenOrderRow[] = [];
  const own = buildOwnOrderIndex(input.snapshot);
  for (const entry of input.snapshot.entries) {
    for (const order of entry.orders) {
      rows.push(buildRow(entry, order, input, own));
    }
  }
  return rows.sort(compareOpenOrderRowsWorstFirst);
}

export type OrderGroupKey = OrderProblem | 'notChecked';

export function orderGroupKey(row: OpenOrderRow): OrderGroupKey {
  return row.problem === 'healthy' && row.competitionUnchecked === true
    ? 'notChecked'
    : row.problem;
}

export function openOrderProblemCounts(
  rows: readonly OpenOrderRow[]
): Record<OrderProblem, number> {
  const counts = Object.fromEntries(ORDER_PROBLEMS.map((p) => [p, 0])) as Record<
    OrderProblem,
    number
  >;
  for (const row of rows) {
    for (const problem of row.problems) counts[problem]++;
  }
  return counts;
}

export function notCheckedCount(rows: readonly OpenOrderRow[]): number {
  return rows.filter((row) => row.competitionUnchecked === true && row.problem === 'healthy')
    .length;
}

export function needsAttentionCount(rows: readonly OpenOrderRow[]): number {
  return rows.filter((row) => isRealProblem(row.problem)).length;
}

export function ownOrderIdSet(snapshot: OpenOrdersSnapshot): Set<number> {
  const ids = new Set<number>();
  for (const entry of snapshot.entries) {
    for (const order of entry.orders) ids.add(order.order_id);
  }
  return ids;
}
