import { clampIskZero, formatIsk } from '@/lib/isk';

/** Whether `value` prints as a gain at `decimals`: the one test behind both the "+" and the green. */
export function iskGains(value: number, decimals: number): boolean {
  return clampIskZero(value, decimals) > 0;
}

/**
 * A signed ISK figure. `formatIsk` prints the minus but not the plus, and
 * colour alone must not carry the sign (DESIGN.md §1, ISK deltas).
 */
export function signedIsk(value: number, decimals: number): string {
  const text = formatIsk(value, decimals);
  return iskGains(value, decimals) ? `+${text}` : text;
}
