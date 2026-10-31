/**
 * A listed price checked against what the item actually traded at. One thin
 * order can list an item at many times its worth (a lone 1B ISK sell order on
 * a 17M ISK implant), and pricing a sale at that listing invents profit. The
 * **Traded Price Ceiling** is the most recent trades support: the higher of
 * the volume-weighted median sale of the last days and the latest day's top
 * trade, so a price that is genuinely rising today is not cut back to last
 * week's.
 */
import type { DemandAggregate } from './haulingMarket';

/** A listing up to this many times the ceiling still counts as the market's price. */
export const LISTED_ABOVE_TRADES_FACTOR = 1.25;

type TradedPrices = Pick<DemandAggregate, 'recentSalePrice' | 'latestDay'>;

/** Null when the item has no recent trades to go on. */
export function tradedPriceCeiling(traded: TradedPrices | undefined): number | null {
  if (!traded) return null;
  const highs = [traded.recentSalePrice, traded.latestDay?.highest].filter(
    (price): price is number => price !== null && price !== undefined && price > 0
  );
  return highs.length === 0 ? null : Math.max(...highs);
}

export interface ListedPriceCheck {
  /** What to count a sale at. */
  price: number;
  listed: number;
  /** The listing sat above every recent trade, so `price` is the ceiling instead. */
  capped: boolean;
}

/** `listed`, or the ceiling when the listing sits past the tolerance above every recent trade. */
export function checkListedPrice(
  listed: number,
  traded: TradedPrices | undefined
): ListedPriceCheck {
  const ceiling = tradedPriceCeiling(traded);
  if (ceiling === null || listed <= ceiling * LISTED_ABOVE_TRADES_FACTOR) {
    return { price: listed, listed, capped: false };
  }
  return { price: ceiling, listed, capped: true };
}
