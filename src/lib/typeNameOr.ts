import type { Translate } from '@/lib/translate';

export function typeNameOr(t: Translate, name: string | undefined, typeId: number): string {
  return name ?? t('common.unknownType', { id: typeId });
}
