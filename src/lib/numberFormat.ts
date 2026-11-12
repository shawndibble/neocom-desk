/**
 * How numbers are written on screen: English (`1,234.56`), European
 * (`1.234,56`) or Swiss (`1'234.56`). Device-local like the time format, because it is a fact about the
 * browser in front of the pilot. Until the pilot picks one, nothing is saved and
 * the browser's language decides, so nobody has to find the setting.
 *
 * Pasted text does not follow this: it is read by shape
 * (`engine/numbers/parseLocalizedNumber`), since a paste carries the EVE
 * client's format. The choice only settles what a pilot types into a field.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { BROWSER_DECIMAL_MARK, setNumberStyle, type NumberStyle } from '@/lib/numberLocale';

export const NUMBER_FORMAT_SETTING_KEY = 'numberFormat';

export type NumberFormatChoice = NumberStyle;

export const NUMBER_FORMATS: readonly NumberFormatChoice[] = ['period', 'comma', 'apostrophe'];

/** The browser's own format. A row an older build saved as `auto` parses to null and lands here. */
export const DEFAULT_NUMBER_FORMAT: NumberFormatChoice =
  BROWSER_DECIMAL_MARK === ',' ? 'comma' : 'period';

export const useNumberFormat = createLocalSetting<NumberFormatChoice>({
  key: NUMBER_FORMAT_SETTING_KEY,
  defaultValue: DEFAULT_NUMBER_FORMAT,
  parse: (raw) => NUMBER_FORMATS.find((format) => format === raw) ?? null,
  onApply: setNumberStyle,
});
