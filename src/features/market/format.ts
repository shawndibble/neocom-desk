/** Display helpers for the Market Browser compare table. */

const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const PERCENT_FORMAT = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** Order-book volume, thousands-separated. */
export function formatVolume(value: number): string {
  return VOLUME_FORMAT.format(value);
}

/** Signed percent with one decimal and an explicit +/- (e.g. "+12.3%", "-4.0%"). */
export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${PERCENT_FORMAT.format(Math.abs(value))}%`;
}

/**
 * Sell-side margin: how much of the lowest sell price is profit over the highest
 * buy price, as a percent. Null unless both sides have a price and the sell
 * price is positive (divide-by-zero). Legitimately negative on an inverted book.
 */
export function computeSpreadPct(sellMin: number | null, buyMax: number | null): number | null {
  if (sellMin === null || buyMax === null || sellMin <= 0) return null;
  return ((sellMin - buyMax) / sellMin) * 100;
}
