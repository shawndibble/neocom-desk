/**
 * One decimal, for a figure read as a magnitude rather than an exact amount —
 * a hold is "60,000 m³", a collateral is "40x the reward", a haul pays "8x the
 * going rate". Further digits imply a precision none of them carries.
 *
 * Distinct from `compactNumber.ts` beside it, which abbreviates the scale
 * ("5.2M"); this keeps the number and trims only the tail.
 */
const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export function formatMagnitude(value: number): string {
  return formatter.format(value);
}
