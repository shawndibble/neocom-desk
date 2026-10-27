/**
 * How numbers are written on screen: with a period or a comma before the
 * fraction. Device-local like the time format, because it is a fact about the
 * browser in front of the pilot. Until the pilot picks one, nothing is saved and
 * the browser's language decides, so nobody has to find the setting.
 *
 * Pasted text does not follow this: it is read by shape
 * (`engine/numbers/parseLocalizedNumber`), since a paste carries the EVE
 * client's format. The choice only settles what a pilot types into a field.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { DecimalMark } from '@/engine/numbers/parseLocalizedNumber';
import { BROWSER_DECIMAL_MARK, setDecimalMark } from '@/lib/numberLocale';

export const NUMBER_FORMAT_SETTING_KEY = 'numberFormat';

export type NumberFormatChoice = 'period' | 'comma';

export const NUMBER_FORMATS: readonly NumberFormatChoice[] = ['period', 'comma'];

/** The browser's own format. A row an older build saved as `auto` parses to null and lands here. */
export const DEFAULT_NUMBER_FORMAT: NumberFormatChoice =
  BROWSER_DECIMAL_MARK === ',' ? 'comma' : 'period';

export function decimalMarkFor(choice: NumberFormatChoice): DecimalMark {
  return choice === 'comma' ? ',' : '.';
}

export const useNumberFormat = createLocalSetting<NumberFormatChoice>({
  key: NUMBER_FORMAT_SETTING_KEY,
  defaultValue: DEFAULT_NUMBER_FORMAT,
  parse: (raw) => NUMBER_FORMATS.find((format) => format === raw) ?? null,
  onApply: (choice) => setDecimalMark(decimalMarkFor(choice)),
});
