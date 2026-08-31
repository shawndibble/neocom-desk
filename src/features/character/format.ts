/** Display helpers shared by the Character views (wallet, assets, contracts, orders). */

import { clampIskZero } from '@/lib/isk';

/**
 * Tailwind text color for a signed ISK amount. Clamps float noise to zero first,
 * or a -0.004 tones red as a loss that isn't real. Same 2-decimal epsilon
 * `formatIsk` uses, since these views print at that precision — the two must
 * agree.
 */
export function iskToneClass(value: number): string {
  return clampIskZero(value, 2) < 0 ? 'text-isk-neg' : 'text-isk-pos';
}

/**
 * "contract_price_payment_corp" → "Contract price payment corp". Generic
 * transform, no per-ref-type map: ESI adds new ref types over time and this
 * reads fine for all of them.
 */
export function humanizeRefType(refType: string): string {
  const words = refType.split('_').join(' ');
  if (words.length === 0) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
