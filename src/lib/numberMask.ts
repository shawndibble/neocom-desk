/**
 * The mask on an editable number: grouped digits at rest, a plain number to
 * type into.
 *
 * Separate from `formatIsk` because that fixes a precision — right for a
 * readout, wrong for a field, where rounding 6,622.35 to "6,622" would show
 * the player a number they did not enter and cannot get back by looking. Here
 * the value keeps whatever decimals it has and only the grouping is added.
 *
 * `unmaskNumber` is the inverse and then some: it also takes what people
 * actually type and paste — separators, stray spaces — and rejects everything
 * that isn't a usable non-negative number, so a caller gets a number or
 * nothing and never a NaN.
 */

import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';
import { createNumberFormat, getDecimalMark } from './numberLocale';

/** `maximumFractionDigits` is capped at 20, which is also as far as a double carries. */
const masker = createNumberFormat({ maximumFractionDigits: 20 });

export function maskNumber(value: number): string {
  return masker(value);
}

/**
 * Typed text in the display format, so a lone mark before three digits is read
 * the way the mask prints it: `1.234` is 1.234 where the mark is a period.
 */
export function unmaskNumber(raw: string): number | undefined {
  const value = parseLocalizedNumber(raw, getDecimalMark());
  return value !== null && value >= 0 ? value : undefined;
}

/**
 * `unmaskNumber` for whole-unit quantities: a typed fraction is floored, not
 * refused. Blank or garbage is still `undefined`.
 */
export function unmaskCount(raw: string): number | undefined {
  const value = unmaskNumber(raw);
  return value === undefined ? undefined : Math.floor(value);
}
