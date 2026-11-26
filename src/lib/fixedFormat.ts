import { createNumberFormat } from './numberLocale';

const ROUNDED_TO_ZERO = /^-(0(?:[.,]0+)?)$/;

const cache = new Map<number, (value: number) => string>();
export function fixedFormat(digits: number): (value: number) => string {
  const hit = cache.get(digits);
  if (hit) return hit;
  const format = createNumberFormat({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  const made = (value: number): string => format(value).replace(ROUNDED_TO_ZERO, '$1');
  cache.set(digits, made);
  return made;
}

export const fixed0 = fixedFormat(0);
export const fixed1 = fixedFormat(1);
export const fixed2 = fixedFormat(2);
