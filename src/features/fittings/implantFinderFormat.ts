import { createNumberFormat } from '@/lib/numberLocale';

const byDecimals = new Map<number, (value: number) => string>();

export function fmt(value: number, decimals: number): string {
  let format = byDecimals.get(decimals);
  if (!format) {
    format = createNumberFormat({
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    byDecimals.set(decimals, format);
  }
  return format(value);
}
