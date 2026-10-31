/**
 * A listed price checked against what the item actually traded at. One thin
 * order can list an item at many times its worth (a lone 1B ISK sell order on
 * a 17M ISK implant), and pricing a sale at that listing invents profit. The
 * **Traded Price Ceiling** is the most recent trades support: the higher of
 * the volume-weighted median sale and the latest day's lowest trade, so a
 * price genuinely rising today is not cut back to last week's. The day's
 * lowest, not its highest, and never past 3× the median: one unit sold to
 * oneself at the inflated price must not lift the ceiling to it.
 */
import type { DemandAggregate } from './haulingMarket';

/** A listing up to this many times the ceiling still counts as the market's price. */
export const LISTED_ABOVE_TRADES_FACTOR = 1.25;

/** The latest day lifts the ceiling to at most this many times the median sale. */
const LATEST_DAY_OVER_MEDIAN = 3;

/** What a type recently traded at: the daily demand object's two price facts. */
export type TradedPrices = Pick<DemandAggregate, 'recentSalePrice' | 'latestDay'>;

/** Null when the item has no recent trades to go on. */
export function tradedPriceCeiling(traded: TradedPrices | undefined): number | null {
  const median = positive(traded?.recentSalePrice);
  const latest = positive(traded?.latestDay?.lowest);
  if (median === null) return latest;
  if (latest === null) return median;
  return Math.max(median, Math.min(latest, median * LATEST_DAY_OVER_MEDIAN));
}

function positive(price: number | null | undefined): number | null {
  return price !== null && price !== undefined && price > 0 ? price : null;
}

export interface ListedPriceCheck {
  /** What to count a sale at. */
  price: number;
  listed: number;
  /** Null with no recent trades to check against. */
  ceiling: number | null;
  /** The listing sat above every recent trade, so `price` is the ceiling instead. */
  capped: boolean;
}

/** `listed`, or the ceiling when the listing sits past the tolerance above it. */
export function capListedPrice(listed: number, ceiling: number | null): ListedPriceCheck {
  if (ceiling === null || listed <= ceiling * LISTED_ABOVE_TRADES_FACTOR) {
    return { price: listed, listed, ceiling, capped: false };
  }
  return { price: ceiling, listed, ceiling, capped: true };
}

/** `capListedPrice` against the item's own recent trades. */
export function checkListedPrice(
  listed: number,
  traded: TradedPrices | undefined
): ListedPriceCheck {
  return capListedPrice(listed, tradedPriceCeiling(traded));
}
