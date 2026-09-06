/**
 * One row per open market order, with every judgement already made — the
 * seam between the pure engines under `src/engine/market` and the panel that
 * renders the Market Orders page. The panel should never re-derive a badge
 * or a sort order from raw ESI shapes; it reads `OpenOrderRow` fields and
 * renders them.
 *
 * Two data-layer inputs are ONLY ever imported as types here (`import type`)
 * even though their runtime bodies touch Dexie/fetch: `OpenOrdersSnapshot`
 * and `OrderCostBasis`. A value import would drag those dependencies into
 * this module and its test environment, breaking the "pure engines/features
 * stay pure" rule this file exists to uphold for the panel.
 *
 * The one non-obvious derivation is `worstScope`: the deep (system/region)
 * check, when it has run for an order, wins outright over the cheap station
 * check — even when the deep check found nothing. It saw the real order
 * book; the station tier only ever saw one aggregated price. A `??` chain
 * between the two would let a "checked, clean" deep result fall through to
 * a stale station read, which is wrong in exactly the case that matters most
 * (the deep check just proved the order is fine).
 *
 * A second non-obvious bit: `MyOrder.systemId` (required by `findUndercut`
 * for its 'system' scope) is not carried on ESI's own order shape — only
 * `location_id`/`region_id` are. It is recovered from the deep-competition
 * list itself: a station belongs to exactly one system, so any competitor
 * (mine included — `loadRegionCompetition` does not filter out the caller's
 * own order) at the same `locationId` yields it. When that fails — no other
 * order at my station appears in the fetched book — the 'system' scope is
 * left OUT of `scopesChecked` rather than guessed at, matching `undercut.ts`'s
 * own "absent means not checked" convention instead of manufacturing a false
 * "checked, clean" for a scope this module could not actually resolve.
 */
import type { OpenOrdersSnapshot, CharacterOpenOrders } from './openOrdersData';
import type { OrderCostBasis } from './orderCostBasis';
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
import { orderExpiry, type OrderExpiry } from '@/engine/market/orderHealth';
import {
  worstProblem,
  allProblems,
  ORDER_PROBLEMS,
  type OrderProblem,
  type OrderProblemFacts,
} from '@/engine/market/orderProblems';

/** What the cheap, always-on station check found. Aggregates give a price but no order count, so this tier can never claim how many units a rival holds. */
export interface StationTier {
  /** Best rival price at my own station, or null when the station has no orders on my side. */
  bestPrice: number | null;
  beatsMe: boolean;
  /** Magnitude of the difference between `bestPrice` and my price — populated whether or not it beats me (e.g. I may be the cheapest). Read together with `beatsMe`; never alone. */
  gapIsk: number;
  /** `gapIsk` as a percentage of my own price. Same caveat as `gapIsk`. */
  gapPct: number;
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
  /** Null for a player structure whose name is not resolved here. */
  stationName: string | null;
  issued: string;
  durationDays: number;
  expiry: OrderExpiry | null;
  floor: OrderFloor | null;
  costBasis: OrderCostBasis | null;
  station: StationTier;
  /** Present only when the deep (system/region) check has been run for this order. */
  deepUndercut: UndercutResult | null;
  /** The tightest scope that beats me, from whichever tiers are known. */
  worstScope: UndercutScope | null;
  problem: OrderProblem;
  problems: OrderProblem[];
  /** price x volumeRemain. */
  iskTiedUp: number;
  belowFloor: boolean;
}

export interface CharacterSkills {
  accountingLevel: number;
  brokerRelationsLevel: number;
}

export interface BuildRowsInput {
  snapshot: OpenOrdersSnapshot;
  typeNames: ReadonlyMap<number, string>;
  /** Keyed `${locationId}:${typeId}`. */
  stationPrices: ReadonlyMap<string, HubAggregate>;
  /** Keyed orderId. */
  costBases: ReadonlyMap<number, OrderCostBasis>;
  /** Keyed orderId; only for orders whose region book has been fetched. */
  deepCompetition?: ReadonlyMap<number, readonly CompetingOrder[]>;
  /** Keyed locationId; a missing entry renders as a player structure. */
  stationNames?: ReadonlyMap<number, string>;
  /** Per character, since skills differ. Keyed characterId. */
  skillsByCharacter: ReadonlyMap<number, CharacterSkills>;
  now: number;
  /** Days without a sale, keyed orderId, when known. */
  daysWithoutSale?: ReadonlyMap<number, number>;
}

function stationPriceKey(locationId: number, typeId: number): string {
  return `${locationId}:${typeId}`;
}

/** The trap: my own order sits inside the aggregate, so a rival price EQUAL to mine is not beating me — only strictly better counts. */
function buildStationTier(
  price: number,
  isBuyOrder: boolean,
  aggregate: HubAggregate | undefined
): StationTier {
  const bestPrice = aggregate ? (isBuyOrder ? aggregate.buyMax : aggregate.sellMin) : null;
  if (bestPrice === null) {
    return { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 };
  }
  const beatsMe = isBuyOrder ? bestPrice > price : bestPrice < price;
  const gapIsk = Math.abs(bestPrice - price);
  const gapPct = price > 0 ? (gapIsk / price) * 100 : 0;
  return { bestPrice, beatsMe, gapIsk, gapPct };
}

/**
 * Recovers my own order's systemId from the deep-competition list, since
 * ESI's own order shape never carries one. Tries an exact orderId match
 * first (my own order is very likely present in an unfiltered region book),
 * then falls back to any competitor sharing my station (same station, same
 * system, regardless of side or who holds it). Null when neither is found.
 */
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
  competitors: readonly CompetingOrder[]
): UndercutResult {
  const systemId = deriveSystemId(order.order_id, order.location_id, competitors);
  const mine: MyOrder = {
    orderId: order.order_id,
    price: order.price,
    locationId: order.location_id,
    // Unused when 'system' is left out of scopesChecked below.
    systemId: systemId ?? 0,
    isBuyOrder,
  };
  const scopesChecked: UndercutScope[] =
    systemId !== null ? ['station', 'system', 'region'] : ['station', 'region'];
  return findUndercut(mine, competitors, scopesChecked);
}

function buildRow(
  entry: CharacterOpenOrders,
  order: MarketOrder,
  input: BuildRowsInput
): OpenOrderRow {
  const {
    typeNames,
    stationPrices,
    costBases,
    deepCompetition,
    stationNames,
    skillsByCharacter,
    now,
    daysWithoutSale,
  } = input;

  const isBuyOrder = order.is_buy_order ?? false;
  const aggregate = stationPrices.get(stationPriceKey(order.location_id, order.type_id));
  const station = buildStationTier(order.price, isBuyOrder, aggregate);

  const deepUndercut = deepCompetition?.has(order.order_id)
    ? buildDeepUndercut(order, isBuyOrder, deepCompetition.get(order.order_id) ?? [])
    : null;

  // Deep check wins outright when it ran, even when it found nothing — it
  // saw the real order book, the station tier only saw one aggregated
  // price. `??` would wrongly resurrect a stale station read here.
  const worstScope: UndercutScope | null =
    deepUndercut !== null
      ? (deepUndercut.worst?.scope ?? null)
      : station.beatsMe
        ? 'station'
        : null;

  const costBasis = costBases.get(order.order_id) ?? null;
  const skills = skillsByCharacter.get(entry.characterId);
  const floor =
    costBasis && skills
      ? orderFloor({
          unitCost: costBasis.unitCost,
          accountingLevel: skills.accountingLevel,
          brokerRelationsLevel: skills.brokerRelationsLevel,
        })
      : null;

  const belowFloor = floor !== null && !isBuyOrder && order.price < floor.relist;

  const expiry = orderExpiry(order.issued, order.duration, now);

  const facts: OrderProblemFacts = {
    isBuyOrder,
    belowFloor,
    undercutScope: worstScope,
    daysLeft: expiry?.daysLeft ?? null,
    volumeRemain: order.volume_remain,
    daysWithoutSale: daysWithoutSale?.get(order.order_id) ?? null,
    outlastsOrder: false,
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
    station,
    deepUndercut,
    worstScope,
    problem,
    problems,
    iskTiedUp: order.price * order.volume_remain,
    belowFloor,
  };
}

function problemRank(problem: OrderProblem): number {
  return ORDER_PROBLEMS.indexOf(problem);
}

/** Worst-first, then biggest ISK tied up first, then orderId — so the order is stable and fully deterministic regardless of input order. */
export function compareOpenOrderRowsWorstFirst(a: OpenOrderRow, b: OpenOrderRow): number {
  const rankDiff = problemRank(a.problem) - problemRank(b.problem);
  if (rankDiff !== 0) return rankDiff;
  if (b.iskTiedUp !== a.iskTiedUp) return b.iskTiedUp - a.iskTiedUp;
  return a.orderId - b.orderId;
}

/**
 * One row per open order, across every character in `snapshot.entries`. A
 * character in `snapshot.skipped` simply has no entry to iterate — it
 * contributes no rows and nothing here needs to guard against it specially.
 * Sorted worst-first so the page's default order is already right.
 */
export function buildOpenOrderRows(input: BuildRowsInput): OpenOrderRow[] {
  const rows: OpenOrderRow[] = [];
  for (const entry of input.snapshot.entries) {
    for (const order of entry.orders) {
      rows.push(buildRow(entry, order, input));
    }
  }
  return rows.sort(compareOpenOrderRowsWorstFirst);
}

export interface OrderGroup {
  problem: OrderProblem;
  rows: OpenOrderRow[];
}

/** Groups by `problem` in ORDER_PROBLEMS order. Empty groups are dropped. */
export function groupOpenOrders(rows: readonly OpenOrderRow[]): OrderGroup[] {
  const groups: OrderGroup[] = [];
  for (const problem of ORDER_PROBLEMS) {
    const groupRows = rows.filter((row) => row.problem === problem);
    if (groupRows.length > 0) groups.push({ problem, rows: groupRows });
  }
  return groups;
}

/** Count per problem across `problems` (not `problem`), for filter chips, which overlap. Every OrderProblem key is present, even at 0. */
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

/** Orders that are not `healthy`. */
export function needsAttentionCount(rows: readonly OpenOrderRow[]): number {
  return rows.filter((row) => row.problem !== 'healthy').length;
}
