import { brokerFee, brokerFeePct, salesTax, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalNetFees } from './appraisal';
import type { MarketHistoryPoint } from './priceHistory';
import { roundPriceDown, undercutPrice } from './priceTick';
import { DAY_MS } from '@/lib/age';

export interface HaulingThresholds {
  horizonDays: number;
  ownShareOfDemand: number;
  minUnitMarginPct: number;
  historyDays: number;
  recentPriceDays: number;
  minOrdersPerTradingDay: number;
  mostDaysMin: number;
  burstsMin: number;
  crowdedOrderCount: number;
  crowdedBand: number;
  lowMarginPct: number;
  suspiciousMarginPct: number;
}

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
  dailyVolume: number;
  daysWithTrades: number;
  recentSalePrice: number | null;
  latestDay: { date: string; highest: number; lowest: number } | null;
  demand: DemandKind;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function volumeWeightedMedian(points: readonly MarketHistoryPoint[]): number | null {
  const total = points.reduce((sum, p) => sum + p.volume, 0);
  if (total <= 0) return null;
  const byPrice = [...points].sort((a, b) => a.highest - b.highest);
  let cumulative = 0;
  for (const p of byPrice) {
    cumulative += p.volume;
    if (cumulative >= total / 2) return p.highest;
  }
  return byPrice[byPrice.length - 1]!.highest;
}

function latestDayOf(points: readonly MarketHistoryPoint[]): DemandSummary['latestDay'] {
  const latest = points.reduce<MarketHistoryPoint | null>(
    (best, p) => (best === null || p.date > best.date ? p : best),
    null
  );
  return latest && { date: latest.date, highest: latest.highest, lowest: latest.lowest };
}

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
  return {
    dailyVolume: totalVolume / thresholds.historyDays,
    daysWithTrades,
    recentSalePrice: volumeWeightedMedian(recent.length > 0 ? recent : inWindow),
    latestDay: latestDayOf(inWindow),
    demand: demandKind(ordersPerTradingDay, daysWithTrades, thresholds),
  };
}

function demandKind(
  ordersPerTradingDay: number,
  daysWithTrades: number,
  thresholds: HaulingThresholds
): DemandKind {
  if (ordersPerTradingDay < thresholds.minOrdersPerTradingDay) return 'rarely';
  if (daysWithTrades >= thresholds.mostDaysMin) return 'most-days';
  return daysWithTrades >= thresholds.burstsMin ? 'bursts' : 'rarely';
}

export interface DemandAggregate {
  volume: number;
  daysWithTrades: number;
  orderSum: number;
  recentSalePrice: number | null;
  latestDay: { date: string; highest: number; lowest: number } | null;
}

export function demandFromAggregate(
  aggregate: DemandAggregate,
  thresholds: HaulingThresholds = HAULING_THRESHOLDS
): DemandSummary {
  const { daysWithTrades } = aggregate;
  const ordersPerTradingDay = daysWithTrades > 0 ? aggregate.orderSum / daysWithTrades : 0;
  return {
    dailyVolume: aggregate.volume / thresholds.historyDays,
    daysWithTrades,
    recentSalePrice: aggregate.recentSalePrice,
    latestDay: aggregate.latestDay,
    demand: demandKind(ordersPerTradingDay, daysWithTrades, thresholds),
  };
}

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

export function hubLadders(
  orders: readonly HubOrder[],
  stationId: number
): { sell: LadderLevel[]; buy: LadderLevel[] } {
  const atStation = orders.filter((o) => o.location_id === stationId);
  return { sell: buildSellLadder(atStation), buy: buildBuyLadder(atStation) };
}

export interface SaleEstimate {
  price: number;
  lowestAsk: number;
  undercutPrice: number;
  recentSalePrice: number;
  unitsAhead: number;
  dailyVolume: number;
  daysToSell: number;
  demandCapUnits: number;
}

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

export function haulingFlags(input: {
  ladder: readonly LadderLevel[];
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
  cost: number;
  revenue: number;
  salesTax: number;
  profit: number;
}

export function walkInstant(input: {
  originLadder: readonly LadderLevel[];
  destBuyLadder: readonly LadderLevel[];
  accountingLevel: number;
  feeDiscountFactor?: number;
  maxUnits?: number;
  minMarginPct?: number;
}): InstantWalk {
  const { originLadder, destBuyLadder, accountingLevel, feeDiscountFactor } = input;
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
    if (sellAt - salesTax(sellAt, accountingLevel, feeDiscountFactor) <= buyAt * minMargin) break;
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
  const tax = units > 0 ? salesTax(revenue, accountingLevel, feeDiscountFactor) : 0;
  return { units, cost, revenue, salesTax: tax, profit: revenue - tax - cost };
}

export interface LotEconomics {
  filled: number;
  cost: number;
  revenue: number;
  fees: number;
  salesTax: number;
  brokerFee: number;
  salesTaxPct: number;
  brokerFeePct: number;
  profit: number;
  marginPct: number;
}

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
  const tax = filled > 0 ? salesTax(revenue, accountingLevel, standing.feeDiscountFactor) : 0;
  const broker =
    filled > 0 && !instant
      ? brokerFee(
          revenue,
          brokerRelationsLevel,
          standing.factionStanding,
          standing.corpStanding,
          standing.safetyTaxPct,
          standing.feeDiscountFactor
        )
      : 0;
  const profit = revenue - tax - broker - cost;
  return {
    filled,
    cost,
    revenue,
    fees: tax + broker,
    salesTax: tax,
    brokerFee: broker,
    salesTaxPct: salesTaxPct(accountingLevel, standing.feeDiscountFactor),
    brokerFeePct: instant
      ? 0
      : brokerFeePct(
          brokerRelationsLevel,
          standing.factionStanding,
          standing.corpStanding,
          standing.safetyTaxPct,
          standing.feeDiscountFactor
        ),
    profit,
    marginPct: cost > 0 ? (profit / cost) * 100 : 0,
  };
}
