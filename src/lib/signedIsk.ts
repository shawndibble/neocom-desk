import { clampIskZero, formatIsk, marketIskDecimals } from '@/lib/isk';

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

/** `signedIsk` at Market precision (`marketIskDecimals`). */
export function signedMarketIsk(value: number): string {
  return signedIsk(value, marketIskDecimals(value));
}

/** The tone for what `signedIsk` prints at `decimals`: none for a figure that rounds to zero. */
export function iskTone(
  value: number,
  decimals: number
): 'text-isk-pos' | 'text-isk-neg' | undefined {
  if (iskGains(value, decimals)) return 'text-isk-pos';
  return iskGains(-value, decimals) ? 'text-isk-neg' : undefined;
}

/** The tone for what `signedMarketIsk` prints: none for `0.00`. */
export function marketIskTone(value: number): 'text-isk-pos' | 'text-isk-neg' | undefined {
  return iskTone(value, marketIskDecimals(value));
}
