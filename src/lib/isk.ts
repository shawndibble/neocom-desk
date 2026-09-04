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

const ISK_SHORTHAND_MULTIPLIERS: Readonly<Record<string, number>> = {
  b: 1_000_000_000,
  m: 1_000_000,
  t: 1_000,
};

/** `10.5m`, `10,500,000`, and `10500000` all parse to 10,500,000. Suffixes: b = billion, m = million, t = thousand. */
const ISK_AMOUNT_PATTERN = /^(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([bmt])?$/i;

/**
 * Parses a threshold-style ISK amount from free text (issue #wallet-balance-threshold):
 * comma-separated thousands, a decimal point, and an optional case-insensitive
 * `b`/`m`/`t` shorthand suffix, in any combination. Returns `null` for anything
 * that doesn't match rather than `NaN`, so a caller can tell "invalid" from "zero".
 */
export function parseIskAmount(input: string): number | null {
  const match = ISK_AMOUNT_PATTERN.exec(input.trim());
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? ISK_SHORTHAND_MULTIPLIERS[suffix] : 1;
  return numeric * multiplier;
}
