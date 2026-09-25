import { clampIskZero, formatIsk } from '@/lib/isk';

/**
 * A signed ISK figure. `formatIsk` prints the minus but not the plus, and
 * colour alone must not carry the sign (DESIGN.md §1, ISK deltas).
 */
export function signedIsk(value: number, decimals: number): string {
  const text = formatIsk(value, decimals);
  return clampIskZero(value, decimals) > 0 ? `+${text}` : text;
}
