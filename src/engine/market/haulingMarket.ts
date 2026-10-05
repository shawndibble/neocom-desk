/**
 * Hauling Opportunities, per item: what a hauler can expect to actually get
 * for a unit bought at one Trade Hub and sold at another, and how quickly.
 *
 * The number a public price-gap tool prints — destination lowest sell minus
 * origin lowest sell — is one every other user of that tool sees too, so the
 * destination's cheapest listings fill with copies of the same haul and the
 * gap closes before the cargo lands. This module reads three things that gap
 * hides: what the item recently *sold* for (`recentSalePrice`), how much
 * is already listed against how much sells (the sell **ladder** against
 * `dailyVolume`), and how many days it trades at all (`demand`).
 *
 * Every rule that is a judgement call lives in `HAULING_THRESHOLDS`, a typed
 * object, so a placeholder is one edit — see the scope decision
 * `docs/context/decisions/*hauling-opportunities*`.
 *
 * Pure: no fetch/DOM/Dexie. Callers adapt ESI order and history shapes at the
 * boundary.
 */
import { brokerFee, brokerFeePct, salesTax, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalNetFees } from './appraisal';
import type { MarketHistoryPoint } from './priceHistory';
import { roundPriceDown, undercutPrice } from './priceTick';

export interface HaulingThresholds {
  /** Days of demand a load may lean on: the horizon a quantity and a "clearing price" are read over. */
  horizonDays: number;
  /**
   * The share of the horizon's unmet demand one hauler can realistically
   * capture: other sellers undercut, and region volume includes trades a
   * listing never sees. Bounds a lot on fast sellers, where a week of sales is
   * more units than anyone moves in one trip.
   */
  ownShareOfDemand: number;
  /**
   * The least a unit must earn, as a percent of what it costs to buy, to be
   * worth buying at all. A unit that only breaks even on today's books loses
   * money the moment a price slips between planning and buying or selling.
   */
  minUnitMarginPct: number;
  /** The history window demand is read over. */
  historyDays: number;
  /** The recent-sale-price window. Falls back to the whole history window when nothing traded inside it. */
  recentPriceDays: number;
  /** Fewer orders than this per trading day is one trader's activity, not a market: it counts as "rarely sells". */
  minOrdersPerTradingDay: number;
  /** Trading days (of `historyDays`) at or above which an item "sells most days". */
  mostDaysMin: number;
  /** Trading days at or above which an item "sells in bursts"; fewer is "rarely sells". */
  burstsMin: number;
  /** A book is crowded when this many orders sit within `crowdedBand` of the lowest ask. */
  crowdedOrderCount: number;
  crowdedBand: number;
  /** Margin after fees, percent, under which a row carries a "low margin" heads-up. */
  lowMarginPct: number;
  /** Margin above this looks too good to be true: a priced-up hub, a one-off spike. It is flagged, never hidden. */
  suspiciousMarginPct: number;
}

/**
 * Placeholders, not tuned figures: no ticket has measured them against real
 * books yet. The demand cut-offs (20 and 8 of 30 days) are the ones the
 * design mockups showed.
 */
export const HAULING_THRESHOLDS: HaulingThresholds = {
  horizonDays: 7,
  ownShareOfDemand: 0.25,
  minUnitMarginPct: 5,
  historyDays: 30,
  recentPriceDays: 7,
  minOrdersPerTradingDay: 2,
  mostDaysMin: 20,
  burstsMin: 8,
  crowdedOrderCount: 10,
  crowdedBand: 0.01,
  lowMarginPct: 3,
  suspiciousMarginPct: 100,
};

export type DemandKind = 'most-days' | 'bursts' | 'rarely';

export interface DemandSummary {
  /** Units sold per day, averaged over the whole history window (days with no trades count as zero). */
  dailyVolume: number;
  /** How many days of the window saw any trade. */
  daysWithTrades: number;
  /** Volume-weighted median sale price over the recent window; null with no history. */
  recentSalePrice: number | null;
  demand: DemandKind;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * The price half of the traded volume sold at or below: a volume-weighted
 * *median* of the days' averages, not their mean. One stray trade at a
 * wildly different price (a single order among many, on one day) drags a mean
 * anywhere, and this estimate is exactly what a hauler would then plan a load
 * around; a median moves only when most of the volume did.
 */
function volumeWeightedMedian(points: readonly MarketHistoryPoint[]): number | null {
  const total = points.reduce((sum, p) => sum + p.volume, 0);
  if (total <= 0) return null;
  const byPrice = [...points].sort((a, b) => a.average - b.average);
  let cumulative = 0;
  for (const p of byPrice) {
    cumulative += p.volume;
    if (cumulative >= total / 2) return p.average;
  }
  return byPrice[byPrice.length - 1]!.average;
}

/**
 * Reads a region's daily history into the three demand facts. `today` is an
 * ISO date (`YYYY-MM-DD`); a point older than the window is ignored, and the
 * window is `historyDays` long counting `today`.
 */
export function summarizeDemand(
  points: readonly MarketHistoryPoint[],
  today: string,
  thresholds: HaulingThresholds = HAULING_THRESHOLDS
): DemandSummary {
  const todayNumber = dayNumber(today);
  const inWindow = points.filter((p) => {
    const age = todayNumber - dayNumber(p.date);
    return age >= 0 && age < thresholds.historyDays && p.volume > 0;
  });
  const recent = inWindow.filter(
    (p) => todayNumber - dayNumber(p.date) < thresholds.recentPriceDays
  );
  const totalVolume = inWindow.reduce((sum, p) => sum + p.volume, 0);
  const daysWithTrades = inWindow.length;
  const ordersPerTradingDay =
    daysWithTrades > 0 ? inWindow.reduce((sum, p) => sum + p.orderCount, 0) / daysWithTrades : 0;
  const demand: DemandKind =
    ordersPerTradingDay < thresholds.minOrdersPerTradingDay
      ? 'rarely'
      : daysWithTrades >= thresholds.mostDaysMin
        ? 'most-days'
        : daysWithTrades >= thresholds.burstsMin
          ? 'bursts'
          : 'rarely';
  return {
    dailyVolume: totalVolume / thresholds.historyDays,
    daysWithTrades,
    recentSalePrice: volumeWeightedMedian(recent.length > 0 ? recent : inWindow),
    demand,
  };
}

/** One price step of a sell ladder: every order at exactly that price. */
export interface LadderLevel {
  price: number;
  units: number;
  orders: number;
}

export interface LadderOrder {
  price: number;
  volume_remain: number;
  is_buy_order: boolean;
}

/** The sell side of an order book as ascending price levels — cheapest first, the order it would fill in. */
export function buildSellLadder(orders: readonly LadderOrder[]): LadderLevel[] {
  const byPrice = new Map<number, LadderLevel>();
  for (const order of orders) {
    if (order.is_buy_order || order.volume_remain <= 0) continue;
    const level = byPrice.get(order.price) ?? { price: order.price, units: 0, orders: 0 };
    level.units += order.volume_remain;
    level.orders += 1;
    byPrice.set(order.price, level);
  }
  return [...byPrice.values()].sort((a, b) => a.price - b.price);
}

/**
 * The buy side of an order book as descending price levels — dearest first,
 * the order an instant sale fills in.
 */
export function buildBuyLadder(orders: readonly LadderOrder[]): LadderLevel[] {
  const byPrice = new Map<number, LadderLevel>();
  for (const order of orders) {
    if (!order.is_buy_order || order.volume_remain <= 0) continue;
    const level = byPrice.get(order.price) ?? { price: order.price, units: 0, orders: 0 };
    level.units += order.volume_remain;
    level.orders += 1;
    byPrice.set(order.price, level);
  }
  return [...byPrice.values()].sort((a, b) => b.price - a.price);
}

export interface HubOrder extends LadderOrder {
  location_id: number;
}

/**
 * Both ladders of a region's book at one hub station. Only orders placed at
 * the station count: a buy order's range is not read, so one placed
 * elsewhere in the region is never assumed to reach the hub (the same rule
 * `orderExits.ts` keeps).
 */
export function hubLadders(
  orders: readonly HubOrder[],
  stationId: number
): { sell: LadderLevel[]; buy: LadderLevel[] } {
  const atStation = orders.filter((o) => o.location_id === stationId);
  return { sell: buildSellLadder(atStation), buy: buildBuyLadder(atStation) };
}

export interface SaleEstimate {
  /**
   * What to expect per unit, priced to sell: the lower of one tick under the
   * cheapest listing and the price the item recently sold for.
   */
  price: number;
  /** Cheapest listing today, for reference. */
  lowestAsk: number;
  /** One tick under the cheapest listing: the price that puts you first in the queue. */
  undercutPrice: number;
  recentSalePrice: number;
  /**
   * Units listed within `crowdedBand` of `price`. Every one of them will be
   * relisted a tick below yours the moment they see it, so they are treated as
   * ahead of you. Zero when `price` sits clear below the book.
   */
  unitsAhead: number;
  /** Units sold per day, echoed for the explanation. */
  dailyVolume: number;
  /** Days until those units plus a reference lot (one day's sales) have sold. */
  daysToSell: number;
  /** Most units worth bringing: `ownShareOfDemand` of a week's sales less those ahead, never under 1. */
  demandCapUnits: number;
}

/**
 * The Expected Sell Price and Days to Sell for one item at one hub.
 *
 * The price is one a hauler would actually list at to sell: a tick under the
 * cheapest listing, or lower still where the item has only been trading below
 * it. An "expected" price above the cheapest listing would assume waiting out
 * every cheaper seller, which the number beside it (`daysToSell`) would then
 * have to contradict.
 *
 * Null when any input is missing — no sell orders at the destination, nothing
 * sold lately, or no recent sale price — because an estimate built on a guess
 * would be exactly the false confidence this exists to remove.
 */
export function estimateSale(input: {
  ladder: readonly LadderLevel[];
  dailyVolume: number;
  recentSalePrice: number | null;
  thresholds?: HaulingThresholds;
}): SaleEstimate | null {
  const { ladder, dailyVolume, recentSalePrice } = input;
  const thresholds = input.thresholds ?? HAULING_THRESHOLDS;
  if (ladder.length === 0 || dailyVolume <= 0 || recentSalePrice === null) return null;

  const lowestAsk = ladder[0]!.price;
  const undercut = undercutPrice(lowestAsk) ?? lowestAsk;
  const raw = Math.min(undercut, recentSalePrice);
  const price = roundPriceDown(raw) ?? raw;

  const reach = price * (1 + thresholds.crowdedBand);
  const unitsAhead = ladder.reduce((sum, l) => (l.price <= reach ? sum + l.units : sum), 0);
  const horizonDemand = dailyVolume * thresholds.horizonDays;
  const referenceLot = Math.max(1, Math.ceil(dailyVolume));
  return {
    price,
    lowestAsk,
    undercutPrice: undercut,
    recentSalePrice,
    unitsAhead,
    dailyVolume,
    daysToSell: (unitsAhead + referenceLot) / dailyVolume,
    demandCapUnits: Math.max(
      1,
      Math.floor(Math.max(0, horizonDemand - unitsAhead) * thresholds.ownShareOfDemand)
    ),
  };
}

export type HaulingFlag = 'crowded' | 'thin' | 'low-margin' | 'outlier';

/** The short heads-up tags for a row. Order is stable so the UI never reshuffles them. */
export function haulingFlags(input: {
  /** The destination's sell ladder; pass none when the lot is not listed (nothing to be crowded out of). */
  ladder: readonly LadderLevel[];
  /** Null when no demand was read — an instant sale into buy orders. */
  demand: DemandKind | null;
  marginPct: number;
  thresholds?: HaulingThresholds;
}): HaulingFlag[] {
  const thresholds = input.thresholds ?? HAULING_THRESHOLDS;
  const flags: HaulingFlag[] = [];
  const lowest = input.ladder[0]?.price;
  if (lowest !== undefined) {
    const ceiling = lowest * (1 + thresholds.crowdedBand);
    const nearby = input.ladder.reduce((sum, l) => (l.price <= ceiling ? sum + l.orders : sum), 0);
    if (nearby >= thresholds.crowdedOrderCount) flags.push('crowded');
  }
  if (input.demand === 'rarely') flags.push('thin');
  if (input.marginPct < thresholds.lowMarginPct) flags.push('low-margin');
  if (input.marginPct > thresholds.suspiciousMarginPct) flags.push('outlier');
  return flags;
}

/** Buys `quantity` units through a sell ladder, cheapest first. `filled` is less than asked when the book runs out. */
export function walkLadder(
  ladder: readonly LadderLevel[],
  quantity: number
): { filled: number; cost: number } {
  let remaining = Math.max(0, Math.floor(quantity));
  let cost = 0;
  let filled = 0;
  for (const level of ladder) {
    if (remaining <= 0) break;
    const take = Math.min(level.units, remaining);
    cost += take * level.price;
    filled += take;
    remaining -= take;
  }
  return { filled, cost };
}

export interface InstantWalk {
  units: number;
  /** ISK to buy them off the origin's sell orders. */
  cost: number;
  /** ISK the destination's buy orders pay for them, before tax. */
  revenue: number;
  salesTax: number;
  profit: number;
}

/**
 * Buy off the origin's sell orders (cheapest first) and sell straight into
 * the destination's buy orders (dearest first), one unit at a time, while
 * each unit still makes money after sales tax. Nothing is listed, so no
 * broker fee. Stops at the first unit that would only break even or lose —
 * every later pairing is dearer to buy and cheaper to sell — when either book
 * runs out, or at `maxUnits`.
 */
export function walkInstant(input: {
  /** The origin's sell ladder, ascending. */
  originLadder: readonly LadderLevel[];
  /** The destination's buy ladder, descending. */
  destBuyLadder: readonly LadderLevel[];
  accountingLevel: number;
  maxUnits?: number;
  /** Stop at the first unit earning less than this percent of its buy price; 0 (the default) stops at break-even. */
  minMarginPct?: number;
}): InstantWalk {
  const { originLadder, destBuyLadder, accountingLevel } = input;
  const minMargin = 1 + Math.max(0, input.minMarginPct ?? 0) / 100;
  let remaining = input.maxUnits === undefined ? Infinity : Math.max(0, Math.floor(input.maxUnits));
  let units = 0;
  let cost = 0;
  let revenue = 0;
  let i = 0;
  let j = 0;
  let leftAtOrigin = originLadder[0]?.units ?? 0;
  let leftAtDest = destBuyLadder[0]?.units ?? 0;
  while (remaining > 0 && i < originLadder.length && j < destBuyLadder.length) {
    const buyAt = originLadder[i]!.price;
    const sellAt = destBuyLadder[j]!.price;
    if (sellAt - salesTax(sellAt, accountingLevel) <= buyAt * minMargin) break;
    const take = Math.min(leftAtOrigin, leftAtDest, remaining);
    units += take;
    cost += take * buyAt;
    revenue += take * sellAt;
    remaining -= take;
    leftAtOrigin -= take;
    leftAtDest -= take;
    if (leftAtOrigin <= 0) leftAtOrigin = originLadder[++i]?.units ?? 0;
    if (leftAtDest <= 0) leftAtDest = destBuyLadder[++j]?.units ?? 0;
  }
  const tax = units > 0 ? salesTax(revenue, accountingLevel) : 0;
  return { units, cost, revenue, salesTax: tax, profit: revenue - tax - cost };
}

export interface LotEconomics {
  /** Units that could actually be bought at the origin (≤ the quantity asked). */
  filled: number;
  /** ISK to buy them: instant buys off the origin's sell orders, so no broker fee on this side. */
  cost: number;
  /** What the lot is expected to bring in, before fees. */
  revenue: number;
  /** Sales tax plus broker fee on the destination listing (sales tax only when selling into buy orders). */
  fees: number;
  salesTax: number;
  /** 100 ISK minimum, once for the lot. */
  brokerFee: number;
  /** The rates behind those two, percent of the sale. */
  salesTaxPct: number;
  brokerFeePct: number;
  profit: number;
  /** Profit as a percentage of the ISK spent buying; 0 when nothing was bought. */
  marginPct: number;
}

/**
 * The profit of buying `quantity` at the origin and listing it all at
 * `expectedPrice` at the destination, at the character's own fee rates.
 * Buying is an instant purchase from sell orders, so — unlike
 * `compareMargin`, which prices a buy order of your own — only the sale side
 * pays a broker fee.
 *
 * With `destBuyLadder` the lot is sold straight into the destination's buy
 * orders instead: `expectedPrice` is ignored, the lot stops at the depth of
 * that book (only what can be sold is bought), revenue is what those orders
 * pay dearest first, and only sales tax is charged. Units past break-even are
 * still priced honestly — this sizes nothing on its own.
 */
export function lotEconomics(input: {
  buyLadder: readonly LadderLevel[];
  expectedPrice: number;
  quantity: number;
  fees: AppraisalNetFees;
  destBuyLadder?: readonly LadderLevel[];
}): LotEconomics {
  const { accountingLevel, brokerRelationsLevel, standing } = input.fees;
  const { destBuyLadder } = input;
  const instant = destBuyLadder !== undefined;
  const quantity = instant
    ? Math.min(
        input.quantity,
        destBuyLadder.reduce((sum, l) => sum + l.units, 0)
      )
    : input.quantity;
  const { filled, cost } = walkLadder(input.buyLadder, quantity);
  const revenue = instant ? walkLadder(destBuyLadder, filled).cost : filled * input.expectedPrice;
  const tax = filled > 0 ? salesTax(revenue, accountingLevel) : 0;
  const broker =
    filled > 0 && !instant
      ? brokerFee(revenue, brokerRelationsLevel, standing.factionStanding, standing.corpStanding)
      : 0;
  const profit = revenue - tax - broker - cost;
  return {
    filled,
    cost,
    revenue,
    fees: tax + broker,
    salesTax: tax,
    brokerFee: broker,
    salesTaxPct: salesTaxPct(accountingLevel),
    brokerFeePct: instant
      ? 0
      : brokerFeePct(brokerRelationsLevel, standing.factionStanding, standing.corpStanding),
    profit,
    marginPct: cost > 0 ? (profit / cost) * 100 : 0,
  };
}
