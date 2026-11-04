/**
 * Which items Item Detail can show "base → skilled" for, and how the engine
 * should hold each one (`skilledAttributes` in `dogmaFittingEngine.ts`): a
 * ship as a hull on its own, a module fitted alone. Drones, subsystems (a
 * Tech 3 part means nothing off its hull) and everything else show base
 * values only. Pure.
 */
import { SHIP_CATEGORY_ID } from '@/sde/categories';
import type { FittingSlotKind, ItemMutation } from './types';

export type SkilledTarget =
  | { kind: 'ship'; typeId: number }
  | { kind: 'module'; typeId: number; slot: FittingSlotKind; mutation?: ItemMutation };

export interface SkilledTargetSde {
  types: Readonly<Record<string | number, { groupID: number } | undefined>>;
  categories: Readonly<Record<string, number>>;
  /** `fittingSlots.json`: typeID -> its rack. */
  slots: Readonly<Record<string, FittingSlotKind | 'drone' | undefined>>;
}

const MODULE_RACKS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig']);

/** `typeId` as the engine should hold it, or null when it has no skilled values to show. */
export function skilledTargetOf(
  typeId: number,
  sde: SkilledTargetSde,
  mutation?: ItemMutation
): SkilledTarget | null {
  const groupId = sde.types[typeId]?.groupID;
  if (groupId !== undefined && sde.categories[String(groupId)] === SHIP_CATEGORY_ID) {
    return { kind: 'ship', typeId };
  }
  // A mutated module's own type id is minted per item; its rack is its base type's.
  const slot = sde.slots[String(typeId)] ?? (mutation && sde.slots[String(mutation.baseTypeId)]);
  if (!slot || !MODULE_RACKS.has(slot)) return null;
  return {
    kind: 'module',
    typeId,
    slot: slot as FittingSlotKind,
    ...(mutation ? { mutation } : {}),
  };
}
