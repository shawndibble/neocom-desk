/** How far today's price has moved from the mined-date price used to value a line. */
export interface PriceDivergence {
  minedDatePrice: number;
  currentPrice: number;
  percentChange: number;
  significant: boolean;
}

const DEFAULT_SIGNIFICANT_THRESHOLD_PCT = 10;

/**
 * Compares a mined-date price against today's, for the Overview tab's "this
 * total isn't what you'd get selling today" note banner (issue #671). Null
 * when either side has no usable price — a 0 or missing price is unpriced,
 * not a real value to divide by, matching `pricing.ts`'s convention.
 */
export function comparePriceToToday(
  minedDatePrice: number,
  currentPrice: number,
  thresholdPct: number = DEFAULT_SIGNIFICANT_THRESHOLD_PCT
): PriceDivergence | null {
  if (!(minedDatePrice > 0) || !(currentPrice > 0)) return null;
  const percentChange = ((currentPrice - minedDatePrice) / minedDatePrice) * 100;
  return {
    minedDatePrice,
    currentPrice,
    percentChange,
    significant: Math.abs(percentChange) >= thresholdPct,
  };
}
