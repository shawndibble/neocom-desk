import { parseNumeric } from '@/lib/isk';

/**
 * A typed numeric bound (max price, min reward, max volume) as an active
 * filter pill shows it: the number formatted, or the text as typed if it does
 * not parse yet — a half-typed "1e" still holds something, and its pill should
 * say so rather than vanish mid-keystroke. Shared by the Item and Courier bars.
 */
export function boundText(raw: string, format: (value: number) => string): string {
  const parsed = parseNumeric(raw);
  return parsed === null ? raw.trim() : format(parsed);
}
