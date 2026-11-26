import { SHIP_CATEGORY_ID } from '@/sde/categories';
import type { FittingSlotKind, ItemMutation } from './types';

export type SkilledTarget =
  | { kind: 'ship'; typeId: number }
  | { kind: 'module'; typeId: number; slot: FittingSlotKind; mutation?: ItemMutation };

export interface SkilledTargetSde {
  types: Readonly<Record<string | number, { groupID: number } | undefined>>;
  categories: Readonly<Record<string, number>>;
  slots: Readonly<Record<string, FittingSlotKind | 'drone' | undefined>>;
}

const MODULE_RACKS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig']);

export function skilledTargetOf(
  typeId: number,
  sde: SkilledTargetSde,
  mutation?: ItemMutation
): SkilledTarget | null {
  const groupId = sde.types[typeId]?.groupID;
  if (groupId !== undefined && sde.categories[String(groupId)] === SHIP_CATEGORY_ID) {
    return { kind: 'ship', typeId };
  }
  const slot = sde.slots[String(typeId)] ?? (mutation && sde.slots[String(mutation.baseTypeId)]);
  if (!slot || !MODULE_RACKS.has(slot)) return null;
  return {
    kind: 'module',
    typeId,
    slot: slot as FittingSlotKind,
    ...(mutation ? { mutation } : {}),
  };
}
