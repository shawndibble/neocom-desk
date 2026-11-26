import { createNumberFormat } from './numberLocale';

const formatter = createNumberFormat({ maximumFractionDigits: 1 });

export function formatMagnitude(value: number): string {
  return formatter(value);
}
