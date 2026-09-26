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
 *
 * A charge-taking module doesn't land empty: it copies the charge another
 * fitted module of the same type already has loaded, or — with none fitted
 * yet — the first of `defaultChargeCandidates()` (the caller's own
 * allowed-charge list, since resolving one needs the dogma engine this pure
 * module never touches). Lazy, so a sibling copy — the common case — never
 * pays for a candidate list it won't use. Neither applies, it lands empty,
 * same as before.
 */
export function addModule(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  typeId: number,
  defaultChargeCandidates: () => readonly number[] = () => []
): Fitting {
  const chargeTypeId =
    fitting.modules.find((module) => module.typeId === typeId && module.chargeTypeId !== undefined)
      ?.chargeTypeId ?? defaultChargeCandidates()[0];
  const modules = fitting.modules.filter((module) => !isAt(module, slot, slotIndex));
  modules.push({
    slot,
    slotIndex,
    typeId,
    state: 'active',
    ...(chargeTypeId !== undefined ? { chargeTypeId } : {}),
  });
  modules.sort(byRackThenIndex);
  return { ...fitting, modules };
}

/** Swaps in a sibling variant, keeping state and the exact charge that was loaded — unlike `addModule`'s charge, which is a fresh default, not a carry-over. A charge/state the variant can't reach is left for recalculation to lower, same tolerance `ModuleRow` gives a stale charge. */
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

/** Loads `chargeTypeId` into every fitted module of `moduleTypeId`, cargo untouched — `loadChargeIntoCompatible` narrowed to one type. */
export function loadChargeIntoAll(
  fitting: Fitting,
  moduleTypeId: number,
  chargeTypeId: number
): Fitting {
  return loadChargeIntoCompatible(fitting, chargeTypeId, {
    accepts: (module) => module.typeId === moduleTypeId,
  }).fitting;
}

/** How a charge goes in — which modules take it, and what one load of it costs the cargo. */
export interface ChargeLoad {
  /**
   * Whether a fitted module takes the charge: its charge groups plus the
   * engine's size check, which the caller resolves (this module never
   * touches the engine). One rule for ammo, missiles, bombs, scripts,
   * crystals, cap boosters and paste alike.
   */
  accepts: (module: FittingModule) => boolean;
  /** Charges one full load of `chargeTypeId` puts in `module` (its capacity over the charge's volume); 1 when unset. */
  chargesPerLoad?: (module: FittingModule, chargeTypeId: number) => number;
  /**
   * The charge comes out of the Fitting's own cargo: each load is debited
   * from it and recorded on the module (`chargeQuantity`), and a charge the
   * module held goes back into it — as many as were recorded, none when
   * the charge didn't come out of the hold.
   */
  fromCargo?: boolean;
  /** Just this module (an Alt-drop, "Load into…"), rather than every one that takes it. */
  only?: { slot: FittingSlotKind; slotIndex: number };
}

export interface ChargeLoadResult {
  fitting: Fitting;
  /** Modules holding the charge afterwards, of the `wanted` that take it — a part-load counts. */
  loaded: number;
  wanted: number;
  /** The cargo emptied before every module that takes the charge had some. */
  ranOut: boolean;
}

function cargoQuantity(cargo: readonly FittingCargoItem[], typeId: number): number {
  return cargo.reduce((sum, item) => (item.typeId === typeId ? sum + item.quantity : sum), 0);
}

/**
 * Loads `chargeTypeId` into every fitted module that takes it, whatever the
 * module's type (two launcher types that fire the same missile both load),
 * or into `only` one. From cargo, each module takes a full load while there
 * is one and the rest when there isn't; one already holding the charge is
 * left alone. The same Fitting back when nothing changed, so the caller's
 * edit history gets no empty step.
 */
export function loadChargeIntoCompatible(
  fitting: Fitting,
  chargeTypeId: number,
  { accepts, chargesPerLoad = () => 1, fromCargo = false, only }: ChargeLoad
): ChargeLoadResult {
  const takes = (module: FittingModule) =>
    (only === undefined || isAt(module, only.slot, only.slotIndex)) && accepts(module);
  const perLoad = (module: FittingModule, typeId: number) =>
    Math.max(1, Math.floor(chargesPerLoad(module, typeId)));
  let cargo = fitting.cargo;
  let left = fromCargo ? cargoQuantity(cargo, chargeTypeId) : Number.POSITIVE_INFINITY;
  let wanted = 0;
  let loaded = 0;
  let changed = false;
  let ranOut = false;
  const modules = fitting.modules.map((module) => {
    if (!takes(module)) return module;
    wanted += 1;
    if (module.chargeTypeId === chargeTypeId) {
      loaded += 1;
      return module;
    }
    if (left <= 0) {
      ranOut = true;
      return module;
    }
    // Rebuilt, not spread, so a quantity recorded for the charge it held never sticks to the new one.
    const next: FittingModule = {
      slot: module.slot,
      slotIndex: module.slotIndex,
      typeId: module.typeId,
      state: module.state,
      chargeTypeId,
    };
    loaded += 1;
    changed = true;
    if (!fromCargo) return next;
    const taken = Math.min(left, perLoad(module, chargeTypeId));
    left -= taken;
    cargo = setCargoQuantity({ ...fitting, cargo }, chargeTypeId, left).cargo;
    // Only what this app provably took out of the hold goes back into it —
    // the Fitting doesn't know how many a charge from anywhere else was.
    if (module.chargeTypeId !== undefined && module.chargeQuantity !== undefined) {
      cargo = addCargo({ ...fitting, cargo }, module.chargeTypeId, module.chargeQuantity).cargo;
    }
    return { ...next, chargeQuantity: taken };
  });
  return {
    fitting: changed ? { ...fitting, modules, cargo } : fitting,
    loaded,
    wanted,
    ranOut,
  };
}

/** Every module of `slot`/`slotIndex`'s type takes on its state and charge (or its lack of one). */
export function copyToAllOfType(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number
): Fitting {
  const source = fitting.modules.find((module) => isAt(module, slot, slotIndex));
  if (source === undefined) return fitting;
  return {
    ...fitting,
    modules: fitting.modules.map((module) => {
      if (module.typeId !== source.typeId || module === source) return module;
      const copy: FittingModule = {
        slot: module.slot,
        slotIndex: module.slotIndex,
        typeId: module.typeId,
        state: source.state,
      };
      return source.chargeTypeId === undefined
        ? copy
        : { ...copy, chargeTypeId: source.chargeTypeId };
    }),
  };
}

export function removeAllOfType(fitting: Fitting, typeId: number): Fitting {
  return { ...fitting, modules: fitting.modules.filter((module) => module.typeId !== typeId) };
}

/**
 * Fits `typeId` into every empty slot of a rack of `slotCount` — "Fill rack
 * with last used". Each lands as `addModule` would, charge and all. The same
 * Fitting when the rack is already full.
 */
export function fillRack(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotCount: number,
  typeId: number,
  defaultChargeCandidates: () => readonly number[] = () => []
): Fitting {
  let next = fitting;
  for (let index = firstFreeSlotIndex(next, slot, slotCount); index !== null;) {
    next = addModule(next, slot, index, typeId, defaultChargeCandidates);
    index = firstFreeSlotIndex(next, slot, slotCount);
  }
  return next;
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
 * space against both. With `onlyTypeId`, only that type launches (a drone's
 * "Launch all", or one dropped on the Drones rack). The same Fitting back
 * when none can launch.
 */
export function launchDrones(
  fitting: Fitting,
  limits: DroneLaunchLimits,
  onlyTypeId?: number
): Fitting {
  const groups = droneGroups(fitting);
  // Only drones already out draw bandwidth — and skipping the rest keeps an
  // unknown (infinite) one in the bay from turning the sum into NaN.
  let bandwidthLeft =
    limits.bandwidthTotal -
    groups.reduce(
      (sum, group) =>
        group.inSpace > 0 ? sum + group.inSpace * limits.bandwidthOf(group.typeId) : sum,
      0
    );
  let countLeft = limits.maxActive - groups.reduce((sum, group) => sum + group.inSpace, 0);
  let next = fitting;
  for (const group of groups) {
    if (countLeft <= 0) break;
    if (onlyTypeId !== undefined && group.typeId !== onlyTypeId) continue;
    const each = limits.bandwidthOf(group.typeId);
    const byBandwidth = !Number.isFinite(each)
      ? 0
      : each > 0
        ? Math.floor(bandwidthLeft / each)
        : Number.POSITIVE_INFINITY;
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

/** Brings every `typeId` in space back to the bay; the same Fitting when none is out. */
export function recallDrones(fitting: Fitting, typeId: number): Fitting {
  const group = droneGroups(fitting).find((entry) => entry.typeId === typeId);
  if (!group || group.inSpace === 0) return fitting;
  return setDroneCounts(fitting, typeId, { inSpace: 0, inBay: group.inBay + group.inSpace });
}

const MODULE_STATES: readonly FittingItemState[] = ['offline', 'online', 'active', 'overload'];

/**
 * The states a module's controls offer: each up to the highest it can reach
 * (`maxState`, from its own calculation), plus the one it is shown in.
 */
export function reachableModuleStates(
  maxState: FittingItemState,
  shown: FittingItemState
): FittingItemState[] {
  const states = MODULE_STATES.slice(0, MODULE_STATES.indexOf(maxState) + 1);
  if (!states.includes(shown)) states.push(shown);
  return states;
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

/** Puts `quantity` more of `typeId` in the cargo, on its stack or as a new last one. */
export function addCargo(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const whole = wholeCount(quantity);
  if (whole === 0) return fitting;
  const held = cargoQuantity(fitting.cargo, typeId);
  if (held === 0) return { ...fitting, cargo: [...fitting.cargo, { typeId, quantity: whole }] };
  return setCargoQuantity(fitting, typeId, held + whole);
}

/** m3 the cargo takes, every stack of it. */
export function cargoVolumeUsed(fitting: Fitting, volumeOf: (typeId: number) => number): number {
  return fitting.cargo.reduce((sum, item) => sum + volumeOf(item.typeId) * item.quantity, 0);
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
