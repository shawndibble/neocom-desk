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
  type FittingCargoItem,
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

/** A bare hull — the start of a Fitting built from scratch, named after the hull. */
export function newFitting(shipTypeId: number, name: string): Fitting {
  return { name, shipTypeId, modules: [], drones: [], cargo: [] };
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

/** Swaps in a sibling variant, keeping state and charge — unlike `addModule`, which discards both for "put something new here". A charge/state the variant can't reach is left for recalculation to lower, same tolerance `ModuleRow` gives a stale charge. */
export function swapModuleType(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  typeId: number
): Fitting {
  return updateModule(fitting, slot, slotIndex, (module) => ({ ...module, typeId }));
}

/**
 * Moves the module at `from` to `to` within one rack — a drag on the Ring —
 * keeping its state and charge, and swapping with whatever sat at `to`.
 * An empty `from` or `from === to` leaves the Fitting as it was.
 */
export function moveModule(
  fitting: Fitting,
  slot: FittingSlotKind,
  from: number,
  to: number
): Fitting {
  if (from === to || !fitting.modules.some((module) => isAt(module, slot, from))) return fitting;
  const modules = fitting.modules.map((module) => {
    if (isAt(module, slot, from)) return { ...module, slotIndex: to };
    if (isAt(module, slot, to)) return { ...module, slotIndex: from };
    return module;
  });
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

/** Loads `chargeTypeId` into every fitted module of `moduleTypeId` — the browser's Charges tab. */
export function loadChargeIntoAll(
  fitting: Fitting,
  moduleTypeId: number,
  chargeTypeId: number
): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.map((module) =>
      module.typeId === moduleTypeId ? { ...module, chargeTypeId } : module
    ),
  };
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

/** What a pilot can have in space at once: the hull's bandwidth, and the Drones skill's count. */
export interface DroneLaunchLimits {
  /** Mbit/s the hull has. */
  bandwidthTotal: number;
  /** Drones the pilot can control at once (0 without the Drones skill). */
  maxActive: number;
  /** Mbit/s one drone of a type draws. */
  bandwidthOf: (typeId: number) => number;
}

/**
 * Launches drones from the bay, in the order the Fitting lists them, as far
 * as bandwidth and the pilot's drone count allow — counting any already in
 * space against both. The same Fitting back when none can launch.
 */
export function launchDrones(fitting: Fitting, limits: DroneLaunchLimits): Fitting {
  const groups = droneGroups(fitting);
  let bandwidthLeft =
    limits.bandwidthTotal -
    groups.reduce((sum, group) => sum + group.inSpace * limits.bandwidthOf(group.typeId), 0);
  let countLeft = limits.maxActive - groups.reduce((sum, group) => sum + group.inSpace, 0);
  let next = fitting;
  for (const group of groups) {
    if (countLeft <= 0) break;
    const each = limits.bandwidthOf(group.typeId);
    const byBandwidth = each > 0 ? Math.floor(bandwidthLeft / each) : Number.POSITIVE_INFINITY;
    const launched = Math.max(0, Math.min(group.inBay, countLeft, byBandwidth));
    if (launched === 0) continue;
    next = setDroneCounts(next, group.typeId, {
      inSpace: group.inSpace + launched,
      inBay: group.inBay - launched,
    });
    bandwidthLeft -= launched * each;
    countLeft -= launched;
  }
  return next;
}

/** Puts `quantity` more of `typeId` in the bay. */
export function addDrones(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const current = droneGroups(fitting).find((group) => group.typeId === typeId);
  return setDroneCounts(fitting, typeId, {
    inSpace: current?.inSpace ?? 0,
    inBay: (current?.inBay ?? 0) + quantity,
  });
}

/**
 * Sets how many of `typeId` the cargo holds, as one stack where the type
 * first appeared; zero or less removes it.
 */
export function setCargoQuantity(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const whole = wholeCount(quantity);
  const cargo: FittingCargoItem[] = [];
  let placed = false;
  for (const item of fitting.cargo) {
    if (item.typeId !== typeId) {
      cargo.push(item);
    } else if (!placed) {
      if (whole > 0) cargo.push({ typeId, quantity: whole });
      placed = true;
    }
  }
  return { ...fitting, cargo };
}

/**
 * One entry per cargo type, first-seen order, however many stacks it arrived
 * as (a paste can list a type twice) — what the editor shows and edits.
 */
export function cargoGroups(fitting: Fitting): FittingCargoItem[] {
  const groups = new Map<number, number>();
  for (const item of fitting.cargo) {
    groups.set(item.typeId, (groups.get(item.typeId) ?? 0) + item.quantity);
  }
  return [...groups].map(([typeId, quantity]) => ({ typeId, quantity }));
}

/**
 * m3 of the drone bay the Fitting's drones take. A drone in space came out
 * of the bay and goes back into it, so it counts the same as one sitting there.
 */
export function droneBayUsed(fitting: Fitting, volumeOf: (typeId: number) => number): number {
  return fitting.drones.reduce((sum, drone) => sum + volumeOf(drone.typeId) * drone.quantity, 0);
}

/** A drone bay: its size, and how big each drone is. */
export interface DroneBay {
  /** m3. */
  capacity: number;
  /** m3 of one drone of a type; 0 when unknown. */
  volumeOf: (typeId: number) => number;
}

/**
 * How many more of `typeId` fit the bay beside what it already holds —
 * never below zero, even on a fit already over the cap. `Infinity` when the
 * type's volume or the bay (`null`, before the ship data) is unknown, so a
 * missing figure never blocks an edit.
 */
export function droneRoom(fitting: Fitting, typeId: number, bay: DroneBay | null): number {
  if (bay === null) return Infinity;
  const volume = bay.volumeOf(typeId);
  if (volume <= 0) return Infinity;
  const free = bay.capacity - droneBayUsed(fitting, bay.volumeOf);
  // A hair of tolerance, so 50 m3 of 5 m3 drones counts as ten, not 9.999….
  return Math.max(0, Math.floor(free / volume + 1e-9));
}

/**
 * `addDrones`, stopping at what the bay holds. Returns the same Fitting when
 * none fit, so the caller's edit history gets no empty step.
 */
export function addDronesWithinBay(
  fitting: Fitting,
  typeId: number,
  quantity: number,
  bay: DroneBay | null
): Fitting {
  const adding = Math.min(quantity, droneRoom(fitting, typeId, bay));
  return adding >= 1 ? addDrones(fitting, typeId, adding) : fitting;
}

/** The highest one of a type's two counts may go: where it is now, plus the room left. */
export function droneCountMax(
  fitting: Fitting,
  typeId: number,
  which: 'inSpace' | 'inBay',
  bay: DroneBay | null
): number {
  const group = droneGroups(fitting).find((entry) => entry.typeId === typeId);
  return (group?.[which] ?? 0) + droneRoom(fitting, typeId, bay);
}

/**
 * Sets one of a type's two counts (the List's boxes), keeping the other. A
 * count may always come down; going up, it stops at what the bay holds.
 */
export function setDroneCountWithinBay(
  fitting: Fitting,
  typeId: number,
  counts: Partial<{ inSpace: number; inBay: number }>,
  bay: DroneBay | null
): Fitting {
  const group = droneGroups(fitting).find((entry) => entry.typeId === typeId);
  const cap = (which: 'inSpace' | 'inBay') => {
    const asked = counts[which];
    if (asked === undefined) return group?.[which] ?? 0;
    return Math.min(asked, droneCountMax(fitting, typeId, which, bay));
  };
  return setDroneCounts(fitting, typeId, { inSpace: cap('inSpace'), inBay: cap('inBay') });
}

/** Drones launched and drones in the bay, every type together. */
export function droneTotals(fitting: Fitting): { inSpace: number; inBay: number } {
  return droneGroups(fitting).reduce(
    (sum, group) => ({ inSpace: sum.inSpace + group.inSpace, inBay: sum.inBay + group.inBay }),
    { inSpace: 0, inBay: 0 }
  );
}
