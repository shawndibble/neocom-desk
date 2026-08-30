/** Display helpers shared by the Character views (wallet, assets, contracts, orders). */

/**
 * Below this magnitude, treat the value as zero (BUG #9): floating-point
 * rounding noise (e.g. -0.004 from a chain of divisions) would otherwise
 * read as a real negative and tone red, reading as a loss that isn't real.
 * Same epsilon `formatIsk` (now `@/lib/isk`) uses at 2-decimal precision.
 */
const ZERO_EPSILON = 0.005;

function clampZero(value: number): number {
  return Math.abs(value) < ZERO_EPSILON ? 0 : value;
}

/** Tailwind text color token for a signed ISK amount (journal entries, profit/loss). */
export function iskToneClass(value: number): string {
  return clampZero(value) < 0 ? 'text-isk-neg' : 'text-isk-pos';
}

/**
 * Humanizes a raw ESI wallet journal `ref_type` (e.g. "contract_price_payment_corp")
 * into readable text ("Contract price payment corp"). Generic underscore→space
 * + sentence-case transform, no per-ref-type translation map: ESI adds new ref
 * types over time and this reads fine for all of them.
 */
export function humanizeRefType(refType: string): string {
  const words = refType.split('_').join(' ');
  if (words.length === 0) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
