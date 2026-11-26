import type { DemandAggregate } from './haulingMarket';

export const LISTED_ABOVE_TRADES_FACTOR = 1.25;

const LATEST_DAY_OVER_MEDIAN = 3;

export type TradedPrices = Pick<DemandAggregate, 'recentSalePrice' | 'latestDay'>;

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
  price: number;
  listed: number;
  ceiling: number | null;
  capped: boolean;
}

export function capListedPrice(listed: number, ceiling: number | null): ListedPriceCheck {
  if (ceiling === null || listed <= ceiling * LISTED_ABOVE_TRADES_FACTOR) {
    return { price: listed, listed, ceiling, capped: false };
  }
  return { price: ceiling, listed, ceiling, capped: true };
}

export function checkListedPrice(
  listed: number,
  traded: TradedPrices | undefined
): ListedPriceCheck {
  return capListedPrice(listed, tradedPriceCeiling(traded));
}
