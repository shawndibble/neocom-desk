/**
 * How numbers are written on screen: with a period or a comma before the
 * fraction. Device-local like the time format, because it is a fact about the
 * browser in front of the pilot, and `auto` (the default) follows that
 * browser's language, so nobody has to find the setting.
 *
 * Pasted text does not follow this: it is read by shape
 * (`engine/numbers/parseLocalizedNumber`), since a paste carries the EVE
 * client's format. The choice only settles what a pilot types into a field.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { browserDecimalMark, setDecimalMark, type DecimalMark } from '@/lib/numberLocale';

export const NUMBER_FORMAT_SETTING_KEY = 'numberFormat';

export type NumberFormatChoice = 'auto' | 'period' | 'comma';

export const NUMBER_FORMATS: readonly NumberFormatChoice[] = ['auto', 'period', 'comma'];

export const DEFAULT_NUMBER_FORMAT: NumberFormatChoice = 'auto';

/** The mark a choice stands for right now. */
export function decimalMarkFor(choice: NumberFormatChoice): DecimalMark {
  if (choice === 'period') return '.';
  if (choice === 'comma') return ',';
  return browserDecimalMark();
}

export const useNumberFormat = createLocalSetting<NumberFormatChoice>({
  key: NUMBER_FORMAT_SETTING_KEY,
  defaultValue: DEFAULT_NUMBER_FORMAT,
  parse: (raw) => NUMBER_FORMATS.find((format) => format === raw) ?? null,
  onApply: (choice) => setDecimalMark(decimalMarkFor(choice)),
});
