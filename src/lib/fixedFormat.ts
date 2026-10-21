/**
 * Fixed-decimal number formatters that follow the active decimal mark: the
 * on-screen replacement for `toFixed(n)`. Never grouped, like `toFixed`;
 * `signDisplay: 'negative'` keeps a rounded-to-zero value from reading `-0.0`.
 */
import { createNumberFormat } from './numberLocale';

const cache = new Map<number, (value: number) => string>();
/** A fixed-digit formatter for a digit count only known at run time; one per count. */
export function fixedFormat(digits: number): (value: number) => string {
  const hit = cache.get(digits);
  if (hit) return hit;
  const made = createNumberFormat({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
    signDisplay: 'negative',
  });
  cache.set(digits, made);
  return made;
}

export const fixed0 = fixedFormat(0);
export const fixed1 = fixedFormat(1);
export const fixed2 = fixedFormat(2);
