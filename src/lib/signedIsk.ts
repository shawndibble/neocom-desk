import { clampIskZero, formatIsk, marketIskDecimals } from '@/lib/isk';

export function iskGains(value: number, decimals: number): boolean {
  return clampIskZero(value, decimals) > 0;
}

export function signedIsk(value: number, decimals: number): string {
  const text = formatIsk(value, decimals);
  return iskGains(value, decimals) ? `+${text}` : text;
}

export function signedMarketIsk(value: number): string {
  return signedIsk(value, marketIskDecimals(value));
}

export function iskTone(
  value: number,
  decimals: number
): 'text-isk-pos' | 'text-isk-neg' | undefined {
  if (iskGains(value, decimals)) return 'text-isk-pos';
  return iskGains(-value, decimals) ? 'text-isk-neg' : undefined;
}

export function marketIskTone(value: number): 'text-isk-pos' | 'text-isk-neg' | undefined {
  return iskTone(value, marketIskDecimals(value));
}
