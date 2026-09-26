/**
 * The game's inventory location flags inside a ship — `HiSlot0`,
 * `FighterTube2`, `FighterBay`… — as both an In-game Fitting's items
 * (`esiFittingMapper.ts`) and an assembled ship's assets (`assetShipMapper.ts`)
 * carry them, and the order launched fighter squadrons take the tubes in,
 * which the engine (`fitMapper.ts`) and ESI both need.
 */
import type { FittingFighter, FittingSlotKind } from './types';

const FLAG_PREFIX: Record<FittingSlotKind, string> = {
  high: 'Hi',
  medium: 'Med',
  low: 'Lo',
  rig: 'Rig',
  subsystem: 'SubSystem',
};

const SLOT_BY_PREFIX: Record<string, FittingSlotKind> = Object.fromEntries(
  Object.entries(FLAG_PREFIX).map(([slot, prefix]) => [prefix, slot as FittingSlotKind])
);

const SLOT_FLAG = /^(Hi|Med|Lo|Rig|SubSystem)Slot(\d+)$/;
const FIGHTER_TUBE_FLAG = /^FighterTube\d$/;

/** The rack and position a slot flag names; null for any other flag. */
export function slotFromFlag(flag: string): { slot: FittingSlotKind; slotIndex: number } | null {
  const match = SLOT_FLAG.exec(flag);
  return match ? { slot: SLOT_BY_PREFIX[match[1]], slotIndex: Number(match[2]) } : null;
}

/** The flag for a rack slot: `slotFlag('medium', 3)` is `MedSlot3`. */
export function slotFlag(slot: FittingSlotKind, slotIndex: number): string {
  return `${FLAG_PREFIX[slot]}Slot${slotIndex}`;
}

/** A squadron in a launch tube is launched ('active'), one in the fighter bay waits ('online'); null for any other flag. */
export function fighterFlagState(flag: string): FittingFighter['state'] | null {
  if (FIGHTER_TUBE_FLAG.test(flag)) return 'active';
  return flag === 'FighterBay' ? 'online' : null;
}

/**
 * The tube each squadron sits in: launched ones take the tubes in order, a
 * bay one none (null). With `tubes`, a launched squadron past the last tube
 * gets none either — it waits in the bay.
 */
export function fighterTubes(
  fighters: readonly Pick<FittingFighter, 'state'>[],
  tubes = Number.POSITIVE_INFINITY
): (number | null)[] {
  let next = 0;
  return fighters.map((fighter) => (fighter.state === 'active' && next < tubes ? next++ : null));
}
