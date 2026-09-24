/**
 * The Fitting editor's edits (issue #1533), each a pure `Fitting -> Fitting`
 * so the workspace can apply one, encode the result into `?f=` and let the
 * URL be the one source of truth for what's open. Never mutates its input.
 *
 * A module is addressed by rack + position (`slot`, `slotIndex`), the same
 * key the Share Link and `@eveshipfit/dogma-engine` both use. Drones are
 * addressed by type: in the domain a type is carried as at most one stack in
 * space (`'active'`) and one in the bay (`'online'`), which is exactly what
 * `shareMapper.ts`'s all-or-nothing stack coarsening round-trips losslessly.
 */
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingDrone,
  type FittingItemState,
  type FittingModule,
  type FittingSlotKind,
} from './types';

const RACK_ORDER = new Map(FITTING_SLOT_KINDS.map((slot, index) => [slot, index]));

function byRackThenIndex(a: FittingModule, b: FittingModule): number {
  return (RACK_ORDER.get(a.slot) ?? 0) - (RACK_ORDER.get(b.slot) ?? 0) || a.slotIndex - b.slotIndex;
}

function isAt(module: FittingModule, slot: FittingSlotKind, slotIndex: number): boolean {
  return module.slot === slot && module.slotIndex === slotIndex;
}

function updateModule(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  update: (module: FittingModule) => FittingModule
): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.map((module) =>
      isAt(module, slot, slotIndex) ? update(module) : module
    ),
  };
}

/**
 * Fits `typeId` at `slot`/`slotIndex`, replacing (and unloading) whatever was
 * there. Asks for `'active'`: the engine lowers a requested state to what the
 * module can actually reach, so a passive module simply calculates online.
 */
export function addModule(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  typeId: number
): Fitting {
  const modules = fitting.modules.filter((module) => !isAt(module, slot, slotIndex));
  modules.push({ slot, slotIndex, typeId, state: 'active' });
  modules.sort(byRackThenIndex);
  return { ...fitting, modules };
}

export function removeModule(fitting: Fitting, slot: FittingSlotKind, slotIndex: number): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.filter((module) => !isAt(module, slot, slotIndex)),
  };
}

export function setModuleState(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  state: FittingItemState
): Fitting {
  return updateModule(fitting, slot, slotIndex, (module) => ({ ...module, state }));
}

/** `null` unloads the charge. */
export function setModuleCharge(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  chargeTypeId: number | null
): Fitting {
  return updateModule(fitting, slot, slotIndex, (module) => {
    const unloaded: FittingModule = {
      slot: module.slot,
      slotIndex: module.slotIndex,
      typeId: module.typeId,
      state: module.state,
    };
    return chargeTypeId === null ? unloaded : { ...unloaded, chargeTypeId };
  });
}

/** The lowest position in a rack of `slotCount` slots nothing occupies, or null when it's full. */
export function firstFreeSlotIndex(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotCount: number
): number | null {
  const taken = new Set(
    fitting.modules.filter((module) => module.slot === slot).map((module) => module.slotIndex)
  );
  for (let index = 0; index < slotCount; index++) if (!taken.has(index)) return index;
  return null;
}

export interface DroneGroup {
  typeId: number;
  inSpace: number;
  inBay: number;
}

/** One entry per drone type, first-seen order, however many stacks it arrived as. */
export function droneGroups(fitting: Fitting): DroneGroup[] {
  const groups = new Map<number, DroneGroup>();
  for (const drone of fitting.drones) {
    const group = groups.get(drone.typeId) ?? { typeId: drone.typeId, inSpace: 0, inBay: 0 };
    if (drone.state === 'active') group.inSpace += drone.quantity;
    else group.inBay += drone.quantity;
    groups.set(drone.typeId, group);
  }
  return [...groups.values()];
}

function wholeCount(value: number): number {
  return Math.max(0, Math.floor(value));
}

/**
 * Rewrites every stack of `typeId` as (at most) one stack in space and one in
 * the bay, where the type first appeared; both zero removes the type.
 */
export function setDroneCounts(
  fitting: Fitting,
  typeId: number,
  counts: { inSpace: number; inBay: number }
): Fitting {
  const inSpace = wholeCount(counts.inSpace);
  const inBay = wholeCount(counts.inBay);
  const replacement: FittingDrone[] = [];
  if (inSpace > 0) replacement.push({ typeId, quantity: inSpace, state: 'active' });
  if (inBay > 0) replacement.push({ typeId, quantity: inBay, state: 'online' });

  const drones: FittingDrone[] = [];
  let placed = false;
  for (const drone of fitting.drones) {
    if (drone.typeId !== typeId) {
      drones.push(drone);
    } else if (!placed) {
      drones.push(...replacement);
      placed = true;
    }
  }
  if (!placed) drones.push(...replacement);
  return { ...fitting, drones };
}

/** Puts `quantity` more of `typeId` in the bay. */
export function addDrones(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const current = droneGroups(fitting).find((group) => group.typeId === typeId);
  return setDroneCounts(fitting, typeId, {
    inSpace: current?.inSpace ?? 0,
    inBay: (current?.inBay ?? 0) + quantity,
  });
}
