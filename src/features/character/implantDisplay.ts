import type { AttributeName } from '@/engine/types';
import type { Translate } from '@/lib/translate';
import type { ImplantDetail } from './clones';

/** Slot order, the way the game lists them; a type with no slot goes last, in ESI's order. */
export function bySlot(
  ids: readonly number[],
  details: ReadonlyMap<number, ImplantDetail>
): number[] {
  // A stable sort; Infinity − Infinity is NaN, which sorts as a tie.
  const slot = (id: number) => details.get(id)?.slot ?? Number.POSITIVE_INFINITY;
  return [...ids].sort((a, b) => slot(a) - slot(b));
}

/** "+3 Intelligence": what an implant adds to an attribute, as the card and the export word it. */
export function implantBonusText(t: Translate, attribute: AttributeName, value: number): string {
  return t('clones.implantBonus', { value, attribute: t(`clones.verdict.attribute.${attribute}`) });
}
