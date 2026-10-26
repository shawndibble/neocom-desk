import { formatIsk } from '@/lib/isk';

export const isk = (value: number, decimals = 0) => `${formatIsk(value, decimals)} ISK`;

/** An EVE/UTC date or instant as "15 Sep 2026". */
export function shortDate(value: string, locale?: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
