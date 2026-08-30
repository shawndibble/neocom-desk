/**
 * Format an ISK amount, thousands-separated (e.g. "1,234,567" or
 * "1,234,567.89"). `decimals` selects precision — default 0 ("whole ISK",
 * used by Industry/Market Browser); pass 2 for cents-equivalent precision
 * (used by Wallet/Overview/Orders/Contracts).
 *
 * Consolidates three previously-duplicated copies (`features/character`,
 * `features/industry`, `features/market`) that differed only in this
 * decimal precision. Only the character copy clamped float-noise values
 * near zero (e.g. -0.004) before formatting; `Intl.NumberFormat` renders
 * negative zero as "-0", which read as a false loss/negative in the UI
 * (BUG #9). The clamp threshold is half a unit-in-the-last-place for the
 * chosen precision (0.005 at 2 decimals — matches the original character
 * epsilon exactly; 0.5 at 0 decimals), so this also fixes the same bug for
 * the industry/market copies, which never had the clamp.
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

export function formatIsk(value: number, decimals = 0): string {
  const epsilon = 0.5 / 10 ** decimals;
  const clamped = Math.abs(value) < epsilon ? 0 : value;
  return formatterFor(decimals).format(clamped);
}
