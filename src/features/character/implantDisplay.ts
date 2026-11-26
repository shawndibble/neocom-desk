import type { AttributeName } from '@/engine/types';
import type { Translate } from '@/lib/translate';
import type { ImplantDetail } from './clones';

export function bySlot(
  ids: readonly number[],
  details: ReadonlyMap<number, ImplantDetail>
): number[] {
  const slot = (id: number) => details.get(id)?.slot ?? Number.POSITIVE_INFINITY;
  return [...ids].sort((a, b) => slot(a) - slot(b));
}

export function implantBonusText(t: Translate, attribute: AttributeName, value: number): string {
  return t('clones.implantBonus', { value, attribute: t(`clones.verdict.attribute.${attribute}`) });
}
