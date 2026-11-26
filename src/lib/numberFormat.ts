import { createLocalSetting } from '@/lib/useLocalSetting';
import { BROWSER_NUMBER_STYLE, setNumberStyle, type NumberStyle } from '@/lib/numberLocale';

export const NUMBER_FORMAT_SETTING_KEY = 'numberFormat';

export type NumberFormatChoice = NumberStyle;

export const NUMBER_FORMATS: readonly NumberFormatChoice[] = ['period', 'comma', 'apostrophe'];

export const DEFAULT_NUMBER_FORMAT: NumberFormatChoice = BROWSER_NUMBER_STYLE;

export const useNumberFormat = createLocalSetting<NumberFormatChoice>({
  key: NUMBER_FORMAT_SETTING_KEY,
  defaultValue: DEFAULT_NUMBER_FORMAT,
  parse: (raw) => NUMBER_FORMATS.find((format) => format === raw) ?? null,
  onApply: setNumberStyle,
});
