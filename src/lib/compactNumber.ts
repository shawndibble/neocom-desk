import { getDecimalMark } from './numberLocale';

const formatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCompactNumber(value: number): string {
  const text = formatter.format(value);
  return getDecimalMark() === ',' ? text.replace('.', ',') : text;
}
