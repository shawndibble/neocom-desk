import type { Translate } from './translate';

export function exportFlag(t: Translate, value: boolean | null | undefined): string | null {
  if (value == null) return null;
  return value ? t('common.exportFlagYes') : t('common.exportFlagNo');
}
