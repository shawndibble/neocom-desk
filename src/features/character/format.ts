/** Display helpers shared by the Character views (wallet, assets, contracts, orders). */

import { clampIskZero } from '@/lib/isk';

/**
 * Tailwind text color token for a signed ISK amount (journal entries,
 * profit/loss). Clamps float-noise values near zero (e.g. -0.004 from a
 * chain of divisions) to zero first (BUG #9): otherwise they'd tone red,
 * reading as a loss that isn't real. Same 2-decimal epsilon `formatIsk`
 * (`@/lib/isk`) uses for its own text — this view shows amounts at that
 * precision, so the two must agree.
 */
export function iskToneClass(value: number): string {
  return clampIskZero(value, 2) < 0 ? 'text-isk-neg' : 'text-isk-pos';
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
