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
 * is also what the `auto` choice resolves to.
 */
import type { DecimalMark } from '@/engine/numbers/parseLocalizedNumber';

/** A locale that groups with the other mark; `de-DE` groups four digits too (`1.234`). */
const LOCALE_FOR: Record<DecimalMark, string> = { '.': 'en-US', ',': 'de-DE' };

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

/** The mark the `auto` choice stands for: the browser's language, read once. */
export const BROWSER_DECIMAL_MARK: DecimalMark = detectDecimalMark(
  typeof navigator === 'undefined' ? undefined : navigator.language
);

let active: DecimalMark = BROWSER_DECIMAL_MARK;

export const getDecimalMark = (): DecimalMark => active;

export function setDecimalMark(mark: DecimalMark): void {
  active = mark;
}

/**
 * A formatter that follows the active mark. Build it once at module scope like
 * an `Intl.NumberFormat`; it builds one `Intl` instance per mark, on first use.
 */
export function createNumberFormat(options: Intl.NumberFormatOptions): (value: number) => string {
  const byMark: Partial<Record<DecimalMark, Intl.NumberFormat>> = {};
  return (value) => {
    const format = (byMark[active] ??= new Intl.NumberFormat(LOCALE_FOR[active], options));
    return format.format(value);
  };
}

const grouped = createNumberFormat({ maximumFractionDigits: 20 });

/** A number in the active format, keeping whatever decimals it has. */
export const formatNumber = (value: number): string => grouped(value);

/** `1234567.89` written with a given mark, for the settings control's examples. */
export function numberFormatExample(mark: DecimalMark): string {
  return new Intl.NumberFormat(LOCALE_FOR[mark], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234567.89);
}
