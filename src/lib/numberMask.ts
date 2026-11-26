import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';
import { createNumberFormat, getDecimalMark } from './numberLocale';

const masker = createNumberFormat({ maximumFractionDigits: 20 });

export function maskNumber(value: number): string {
  return masker(value);
}

export function unmaskNumber(raw: string): number | undefined {
  const value = parseLocalizedNumber(raw, getDecimalMark());
  return value !== null && value >= 0 ? value : undefined;
}

export function unmaskCount(raw: string): number | undefined {
  const value = unmaskNumber(raw);
  return value === undefined ? undefined : Math.floor(value);
}
