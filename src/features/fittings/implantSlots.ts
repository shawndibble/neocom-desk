import type { TFunction } from 'i18next';
import type { ImplantKind, SlotOf } from '@/engine/fittings/implantFinder';
import type { FittingImplantSet } from '@/engine/fittings/types';

export function parseSlotKey(key: string): { kind: ImplantKind; slot: number } {
  const [kind, slot] = key.split(':');
  return { kind: kind === 'booster' ? 'booster' : 'implant', slot: Number(slot) };
}

export function slotName(t: TFunction, kind: ImplantKind, slot: number): string {
  return kind === 'booster'
    ? t('fittings.implantFinder.boosterSlot', { slot })
    : t('fittings.implantFinder.slotShort', { slot });
}

export function occupantOf(
  set: FittingImplantSet,
  slotOf: SlotOf,
  kind: ImplantKind,
  slot: number
): number | undefined {
  return [...set.implants, ...set.boosters].find((id) => {
    const at = slotOf(id);
    return at?.kind === kind && at.slot === slot;
  });
}
