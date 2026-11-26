import type { DecimalMark } from '@/engine/numbers/parseLocalizedNumber';

export type NumberStyle = 'period' | 'comma' | 'apostrophe';

const LOCALE_FOR: Record<NumberStyle, string> = {
  period: 'en-US',
  comma: 'de-DE',
  apostrophe: 'de-CH',
};

export const decimalMarkOf = (style: NumberStyle): DecimalMark => (style === 'comma' ? ',' : '.');

export function detectDecimalMark(locale?: string): DecimalMark {
  try {
    const fraction = new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === 'decimal');
    return fraction?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

export const BROWSER_DECIMAL_MARK: DecimalMark = detectDecimalMark(
  typeof navigator === 'undefined' ? undefined : navigator.language
);

export const BROWSER_NUMBER_STYLE: NumberStyle = BROWSER_DECIMAL_MARK === ',' ? 'comma' : 'period';

let active: NumberStyle = BROWSER_NUMBER_STYLE;

export const getDecimalMark = (): DecimalMark => decimalMarkOf(active);

export function setNumberStyle(style: NumberStyle): void {
  active = style;
}

export function setDecimalMark(mark: DecimalMark): void {
  active = mark === ',' ? 'comma' : 'period';
}

export function createNumberFormat(options: Intl.NumberFormatOptions): (value: number) => string {
  const byStyle: Partial<Record<NumberStyle, Intl.NumberFormat>> = {};
  return (value) => {
    const format = (byStyle[active] ??= new Intl.NumberFormat(LOCALE_FOR[active], options));
    return format.format(value);
  };
}

const grouped = createNumberFormat({ maximumFractionDigits: 20 });

export const getGroupMark = (): string => grouped(1_000_000).replace(/\d/g, '')[0] ?? '';

export const formatNumber = (value: number): string => grouped(value);

export function numberFormatExample(style: NumberStyle): string {
  return new Intl.NumberFormat(LOCALE_FOR[style], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234.56);
}
