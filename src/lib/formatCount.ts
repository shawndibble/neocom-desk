import { formatNumber } from './numberLocale';

export function formatCount(value: number): string {
  return formatNumber(Math.round(value));
}
