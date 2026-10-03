import { formatCompactNumber } from '@/lib/compactNumber';

/** A Charge Picker price: "62", "1,240", "12.5K". */
export function formatIsk(value: number): string {
  return value >= 10_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString('en-US');
}
