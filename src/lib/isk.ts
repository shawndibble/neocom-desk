/**
 * Thousands-separated ISK. `decimals` selects precision — 0 (default) for whole
 * ISK in Industry/Market, 2 for Wallet/Overview/Orders/Contracts. Values are
 * zero-clamped first, because `Intl.NumberFormat` renders negative zero as
 * "-0", which reads as a loss that isn't real.
 */

const formatters = new Map<number, Intl.NumberFormat>();

function formatterFor(decimals: number): Intl.NumberFormat {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return formatter;
}

/**
 * Clamps to zero below half a unit-in-the-last-place for `decimals` (0.005 at 2,
 * 0.5 at 0). Exported so a caller that tones a value independently of
 * `formatIsk`'s text (`iskToneClass`) clamps the same noise the same way. No
 * default for `decimals`: a caller here is answering "is this really negative",
 * where a wrong precision silently changes the answer, not just the digits.
 */
export function clampIskZero(value: number, decimals: number): number {
  const epsilon = 0.5 / 10 ** decimals;
  return Math.abs(value) < epsilon ? 0 : value;
}

export function formatIsk(value: number, decimals = 0): string {
  return formatterFor(decimals).format(clampIskZero(value, decimals));
}
