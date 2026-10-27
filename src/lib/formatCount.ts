import { formatNumber } from './numberLocale';

/** A whole number in the display format: 12,345 or 12.345. Rounds first; for plain counts and volumes, not ISK. */
export function formatCount(value: number): string {
  return formatNumber(Math.round(value));
}
