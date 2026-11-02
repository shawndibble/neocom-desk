/**
 * Fixed-decimal number formatters that follow the active decimal mark: the
 * on-screen replacement for `toFixed(n)`. Never grouped, like `toFixed`;
 * a value that rounds to zero loses its minus by hand so it never reads `-0.0`
 * (assumes ASCII `-` and digits, true of the two locales in `numberLocale.ts`).
 */
import { createNumberFormat } from './numberLocale';

/** `-0`, `-0.0`, `-0,00`: a negative that rounded to zero. */
const ROUNDED_TO_ZERO = /^-(0(?:[.,]0+)?)$/;

const cache = new Map<number, (value: number) => string>();
/** A fixed-digit formatter for a digit count only known at run time; one per count. */
export function fixedFormat(digits: number): (value: number) => string {
  const hit = cache.get(digits);
  if (hit) return hit;
  // No `signDisplay: 'negative'`: engines before Chrome 106 / Safari 15.4 throw a RangeError on
  // that value, and this runs while rendering the landing page. The sign is stripped by hand.
  const format = createNumberFormat({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  const made = (value: number): string => format(value).replace(ROUNDED_TO_ZERO, '$1');
  cache.set(digits, made);
  return made;
}

export const fixed0 = fixedFormat(0);
export const fixed1 = fixedFormat(1);
export const fixed2 = fixedFormat(2);
