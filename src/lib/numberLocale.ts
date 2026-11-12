/**
 * Which mark a number's fraction starts with on screen: `1,234,567.89` or
 * `1.234.567,89`. The one place every number formatter and every typed-number
 * parser asks.
 *
 * Kept free of Dexie and React so `isk.ts`, `numberMask.ts` and the other
 * formatters can import it without pulling the settings store in; the store
 * (`numberFormat.ts`) pushes its resolved choice here.
 *
 * Until a choice is applied the mark comes from the browser's language, which
 * is also the format the settings control starts on.
 */
import type { DecimalMark } from '@/engine/numbers/parseLocalizedNumber';

/**
 * How numbers are written: `1,234.56` (period), `1.234,56` (comma) or the Swiss
 * `1'234.56` (apostrophe, a period decimal like English with its own grouping mark).
 * The decimal mark alone cannot tell the first and last apart.
 */
export type NumberStyle = 'period' | 'comma' | 'apostrophe';

/** A locale that writes the style; `de-DE` groups four digits too (`1.234`). */
const LOCALE_FOR: Record<NumberStyle, string> = {
  period: 'en-US',
  comma: 'de-DE',
  apostrophe: 'de-CH',
};

export const decimalMarkOf = (style: NumberStyle): DecimalMark => (style === 'comma' ? ',' : '.');

/** The decimal mark a locale writes, read from `Intl` itself; `.` when it cannot say. */
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

/** The mark the browser's language writes, read once. */
export const BROWSER_DECIMAL_MARK: DecimalMark = detectDecimalMark(
  typeof navigator === 'undefined' ? undefined : navigator.language
);

/** The style the browser's language starts on (a Swiss browser starts on English: Swiss is picked, not detected). */
export const BROWSER_NUMBER_STYLE: NumberStyle = BROWSER_DECIMAL_MARK === ',' ? 'comma' : 'period';

let active: NumberStyle = BROWSER_NUMBER_STYLE;

export const getDecimalMark = (): DecimalMark => decimalMarkOf(active);

export function setNumberStyle(style: NumberStyle): void {
  active = style;
}

/** The two styles a decimal mark names (the apostrophe style shares the period's mark). */
export function setDecimalMark(mark: DecimalMark): void {
  active = mark === ',' ? 'comma' : 'period';
}

/**
 * A formatter that follows the active mark. Build it once at module scope like
 * an `Intl.NumberFormat`; it builds one `Intl` instance per style, on first use.
 */
export function createNumberFormat(options: Intl.NumberFormatOptions): (value: number) => string {
  const byStyle: Partial<Record<NumberStyle, Intl.NumberFormat>> = {};
  return (value) => {
    const format = (byStyle[active] ??= new Intl.NumberFormat(LOCALE_FOR[active], options));
    return format.format(value);
  };
}

const grouped = createNumberFormat({ maximumFractionDigits: 20 });

/** The thousands separator of the active format (a comma, a period, ...), as it prints a million (a locale may skip grouping below 10,000). */
export const getGroupMark = (): string => grouped(1_000_000).replace(/\d/g, '')[0] ?? '';

/** A number in the active format, keeping whatever decimals it has. */
export const formatNumber = (value: number): string => grouped(value);

/** `1234.56` written in a given style, for the settings control's examples. */
export function numberFormatExample(style: NumberStyle): string {
  return new Intl.NumberFormat(LOCALE_FOR[style], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234.56);
}
