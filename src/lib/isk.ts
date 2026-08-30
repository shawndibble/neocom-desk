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

/**
 * Zero-clamp threshold is half a unit-in-the-last-place for `decimals` (0.005
 * at 2 decimals, 0.5 at 0). Exported so a caller that tones/colors a value
 * independently of `formatIsk`'s own text (`iskToneClass` in
 * `features/character/format.ts`) clamps the same rounding noise the same
 * way. `decimals` has no default here — unlike `formatIsk`, a caller of this
 * function is answering "is this really negative", where a wrong precision
 * (e.g. forgetting the `2`) silently changes the answer rather than just the
 * printed digits.
 */
export function clampIskZero(value: number, decimals: number): number {
  const epsilon = 0.5 / 10 ** decimals;
  return Math.abs(value) < epsilon ? 0 : value;
}

export function formatIsk(value: number, decimals = 0): string {
  return formatterFor(decimals).format(clampIskZero(value, decimals));
}
