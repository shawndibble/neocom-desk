import { createContext } from 'react';
import type { TFunction } from 'i18next';
import type { FittingSlotKind } from '@/engine/fittings/types';

export const OpenAfterMenuContext = createContext<(fn: () => void) => void>((fn) => fn());

export function slotName(t: TFunction, rack: FittingSlotKind, index: number) {
  return t('fittings.item.slot', { rack: t(`fittings.list.rack.${rack}`), index: index + 1 });
}
