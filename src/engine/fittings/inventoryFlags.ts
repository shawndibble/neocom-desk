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

export function slotFromFlag(flag: string): { slot: FittingSlotKind; slotIndex: number } | null {
  const match = SLOT_FLAG.exec(flag);
  return match ? { slot: SLOT_BY_PREFIX[match[1]], slotIndex: Number(match[2]) } : null;
}

export function slotFlag(slot: FittingSlotKind, slotIndex: number): string {
  return `${FLAG_PREFIX[slot]}Slot${slotIndex}`;
}

export function fighterFlagState(flag: string): FittingFighter['state'] | null {
  if (FIGHTER_TUBE_FLAG.test(flag)) return 'active';
  return flag === 'FighterBay' ? 'online' : null;
}

export function fighterTubes(
  fighters: readonly Pick<FittingFighter, 'state'>[],
  tubes = Number.POSITIVE_INFINITY
): (number | null)[] {
  let next = 0;
  return fighters.map((fighter) => (fighter.state === 'active' && next < tubes ? next++ : null));
}
