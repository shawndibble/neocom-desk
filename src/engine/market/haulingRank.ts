/**
 * The order the Hauling scan's two cheap passes shortlist items in: by what a
 * trip could earn on an item, not by its price ratio. A 3x gap on two units
 * listed fills nothing; a 1.2x gap on thousands fills the hold. Scope
 * decision _Hauling ranks by trip profit and fills the hold until full_.
 *
 * Both scores are an ISK gap per unit after a rough fee, times the units a
 * trip could move. They only order candidates: the minimum-gap filters that
 * decide what is looked at stay with the caller. A gap the fee eats scores at
 * most zero, so it ranks after every profitable item without being dropped.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import { HAULING_THRESHOLDS, type HaulingThresholds } from './haulingMarket';

/** Fees are not known before the order books are read, so both passes take this rough cut off the sale price. */
export const ROUGH_FEE_FACTOR = 0.94;

function score(unitProfit: number, units: number): number {
  // A loss keeps its own (negative) size so a smaller loss ranks above a bigger one, both after any profit.
  return unitProfit <= 0 ? unitProfit : unitProfit * Math.max(0, units);
}

export interface PriceScoreInput {
  /** Origin lowest sell: what a unit costs. */
  buy: number;
  /** Destination lowest sell (listing) or highest buy (instant sale). */
  sell: number;
  /** Units listed for sale at the origin. */
  originListed: number;
  /** Units listed at the destination on the side sold into: sell orders to list against, buy orders to sell into. */
  destListed: number;
}

/**
 * Pass 1 (hub aggregates): the gap after the rough fee times the units listed
 * at both ends, the smaller — a liquidity proxy from the same call.
 */
export function priceScore({ buy, sell, originListed, destListed }: PriceScoreInput): number {
  return score(sell * ROUGH_FEE_FACTOR - buy, Math.min(originListed, destListed));
}

export interface HistoryScoreInput {
  /** Origin lowest sell: what a unit costs. */
  buy: number;
  /** What the item recently sold for at the destination. */
  recentSalePrice: number;
  /** Units sold per day in the destination region. */
  dailyVolume: number;
  /** Units listed for sale at the origin. */
  originListed: number;
}

/**
 * Pass 2 (history): the unit profit at the recent sale price times the units a
 * lot could take — one hauler's share of the horizon's sales, capped by what
 * the origin lists.
 */
export function historyScore(
  { buy, recentSalePrice, dailyVolume, originListed }: HistoryScoreInput,
  thresholds: HaulingThresholds = HAULING_THRESHOLDS
): number {
  const lot = Math.floor(dailyVolume * thresholds.horizonDays * thresholds.ownShareOfDemand);
  return score(recentSalePrice * ROUGH_FEE_FACTOR - buy, Math.min(lot, originListed));
}
