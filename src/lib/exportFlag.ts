import type { Translate } from './translate';

/** A yes/no fact as an export cell; unknown stays blank. Text, so a flag column reads the same in CSV, Excel and Sheets. */
export function exportFlag(t: Translate, value: boolean | null | undefined): string | null {
  if (value == null) return null;
  return value ? t('common.exportFlagYes') : t('common.exportFlagNo');
}
