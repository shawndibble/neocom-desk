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

/** `maximumFractionDigits` is capped at 20, which is also as far as a double carries. */
const masker = new Intl.NumberFormat('en', { maximumFractionDigits: 20 });

export function maskNumber(value: number): string {
  return masker.format(value);
}

/** Group separators and the spaces some exports use in their place. */
const SEPARATORS = /[,\s]/g;

export function unmaskNumber(raw: string): number | undefined {
  const bare = raw.replace(SEPARATORS, '');
  if (bare === '') return undefined;
  const value = Number(bare);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
