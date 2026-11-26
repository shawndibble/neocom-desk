import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingItemState,
  type FittingModule,
  type FittingSlotKind,
  type FittingStats,
} from './types';
import { withoutMutation } from './mutaplasmids';

const RACK_ORDER = new Map(FITTING_SLOT_KINDS.map((slot, index) => [slot, index]));

function byRackThenIndex(a: FittingModule, b: FittingModule): number {
  return (RACK_ORDER.get(a.slot) ?? 0) - (RACK_ORDER.get(b.slot) ?? 0) || a.slotIndex - b.slotIndex;
}

function isAt(module: FittingModule, slot: FittingSlotKind, slotIndex: number): boolean {
  return module.slot === slot && module.slotIndex === slotIndex;
}

export type ModuleAt = Pick<FittingModule, 'slot' | 'slotIndex'>;

function isAnyOf(module: FittingModule, at: readonly ModuleAt[]): boolean {
  return at.some((where) => isAt(module, where.slot, where.slotIndex));
}

function unloaded(module: FittingModule): FittingModule {
  return {
    slot: module.slot,
    slotIndex: module.slotIndex,
    typeId: module.typeId,
    state: module.state,
  };
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

export function newFitting(shipTypeId: number, name: string): Fitting {
  return { name, shipTypeId, modules: [], drones: [], cargo: [] };
}

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

export function swapModuleType(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  typeId: number
): Fitting {
  return updateModule(fitting, slot, slotIndex, (module) => withoutMutation(module, typeId));
}

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

function withHeldChargesReturned(
  fitting: Fitting,
  modules: readonly FittingModule[]
): Fitting['cargo'] {
  let cargo = fitting.cargo;
  for (const module of modules) {
    if (module.chargeTypeId === undefined || module.chargeQuantity === undefined) continue;
    cargo = addCargo({ ...fitting, cargo }, module.chargeTypeId, module.chargeQuantity).cargo;
  }
  return cargo;
}

export function setModuleCharge(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  chargeTypeId: number | null
): Fitting {
  const module = fitting.modules.find((m) => isAt(m, slot, slotIndex));
  if (module === undefined || (chargeTypeId !== null && module.chargeTypeId === chargeTypeId)) {
    return fitting;
  }
  const updated = updateModule(fitting, slot, slotIndex, (m) =>
    chargeTypeId === null ? unloaded(m) : { ...unloaded(m), chargeTypeId }
  );
  return { ...updated, cargo: withHeldChargesReturned(fitting, [module]) };
}

export function setModulesState(
  fitting: Fitting,
  at: readonly ModuleAt[],
  state: FittingItemState
): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.map((module) => (isAnyOf(module, at) ? { ...module, state } : module)),
  };
}

export function unloadCharges(fitting: Fitting, at: readonly ModuleAt[]): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.map((module) => (isAnyOf(module, at) ? unloaded(module) : module)),
    cargo: withHeldChargesReturned(
      fitting,
      fitting.modules.filter((module) => isAnyOf(module, at))
    ),
  };
}

const CHARGE_FIT_TOLERANCE = 1e-5;

export function chargesPerLoad(capacity: number, volume: number): number {
  if (!(capacity > 0) || !(volume > 0)) return 1;
  return Math.max(1, Math.floor((capacity / volume) * (1 + CHARGE_FIT_TOLERANCE)));
}

export interface ChargeLoad {
  accepts: (module: FittingModule) => boolean;
  chargesPerLoad?: (module: FittingModule, chargeTypeId: number) => number;
  fromCargo?: boolean;
  only?: ModuleAt | readonly ModuleAt[];
}

export interface ChargeLoadResult {
  fitting: Fitting;
  loaded: number;
  newlyLoaded: number;
  wanted: number;
  ranOut: boolean;
}

function cargoQuantity(cargo: readonly FittingCargoItem[], typeId: number): number {
  return cargo.reduce((sum, item) => (item.typeId === typeId ? sum + item.quantity : sum), 0);
}

export function loadChargeIntoCompatible(
  fitting: Fitting,
  chargeTypeId: number,
  { accepts, chargesPerLoad = () => 1, fromCargo = false, only }: ChargeLoad
): ChargeLoadResult {
  const onlyAt = only === undefined ? undefined : 'slot' in only ? [only] : only;
  const takes = (module: FittingModule) =>
    (onlyAt === undefined || isAnyOf(module, onlyAt)) && accepts(module);
  const perLoad = (module: FittingModule, typeId: number) =>
    Math.max(1, Math.floor(chargesPerLoad(module, typeId)));
  let cargo = fitting.cargo;
  let left = fromCargo ? cargoQuantity(cargo, chargeTypeId) : Number.POSITIVE_INFINITY;
  let wanted = 0;
  let loaded = 0;
  let newlyLoaded = 0;
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
    const next: FittingModule = { ...unloaded(module), chargeTypeId };
    loaded += 1;
    newlyLoaded += 1;
    changed = true;
    if (!fromCargo) {
      cargo = withHeldChargesReturned({ ...fitting, cargo }, [module]);
      return next;
    }
    const taken = Math.min(left, perLoad(module, chargeTypeId));
    left -= taken;
    cargo = setCargoQuantity({ ...fitting, cargo }, chargeTypeId, left).cargo;
    cargo = withHeldChargesReturned({ ...fitting, cargo }, [module]);
    return { ...next, chargeQuantity: taken };
  });
  return {
    fitting: changed ? { ...fitting, modules, cargo } : fitting,
    loaded,
    newlyLoaded,
    wanted,
    ranOut,
  };
}

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

export function setDroneCounts(
  fitting: Fitting,
  typeId: number,
  counts: { inSpace: number; inBay: number }
): Fitting {
  const inSpace = wholeCount(counts.inSpace);
  const inBay = wholeCount(counts.inBay);
  if (fitting.drones.some((drone) => drone.typeId === typeId && drone.mutation)) {
    return setMutatedDroneCounts(fitting, typeId, inSpace, inBay);
  }
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

function setMutatedDroneCounts(
  fitting: Fitting,
  typeId: number,
  inSpace: number,
  inBay: number
): Fitting {
  const stacks = fitting.drones
    .filter((drone) => drone.typeId === typeId)
    .map((drone) => ({ drone, active: 0, bay: 0 }));
  let space = inSpace;
  let bay = inBay;
  for (const stack of [
    ...stacks.filter(({ drone }) => drone.state === 'active'),
    ...stacks.filter(({ drone }) => drone.state !== 'active'),
  ]) {
    stack.active = Math.min(stack.drone.quantity, space);
    space -= stack.active;
    stack.bay = Math.min(stack.drone.quantity - stack.active, bay);
    bay -= stack.bay;
  }

  const replacement: FittingDrone[] = [];
  const addPlain = (state: FittingDrone['state'], quantity: number) => {
    if (quantity <= 0) return;
    const stack = replacement.find((d) => !d.mutation && d.state === state);
    if (stack) stack.quantity += quantity;
    else replacement.push({ typeId, quantity, state });
  };
  for (const { drone, active, bay: inBayHere } of stacks) {
    if (!drone.mutation) {
      addPlain('active', active);
      addPlain('online', inBayHere);
    } else if (active > 0 || inBayHere > 0) {
      replacement.push({ ...drone, state: active > 0 ? 'active' : 'online' });
    }
  }
  addPlain('active', space);
  addPlain('online', bay);

  const drones: FittingDrone[] = [];
  let placed = false;
  for (const drone of fitting.drones) {
    if (drone.typeId !== typeId) drones.push(drone);
    else if (!placed) {
      drones.push(...replacement);
      placed = true;
    }
  }
  return { ...fitting, drones };
}

export interface DroneLaunchLimits {
  bandwidthTotal: number;
  maxActive: number;
  bandwidthOf: (typeId: number) => number;
}

type LaunchLimitStats = Pick<
  FittingStats,
  'droneBandwidthTotal' | 'maxActiveDrones' | 'droneBandwidthByType'
>;

export function launchLimitsFrom(stats: LaunchLimitStats): DroneLaunchLimits;
export function launchLimitsFrom(stats: LaunchLimitStats | null): DroneLaunchLimits | null;
export function launchLimitsFrom(stats: LaunchLimitStats | null): DroneLaunchLimits | null {
  if (stats === null) return null;
  return {
    bandwidthTotal: stats.droneBandwidthTotal,
    maxActive: stats.maxActiveDrones,
    bandwidthOf: (typeId) => stats.droneBandwidthByType[typeId] ?? Number.POSITIVE_INFINITY,
  };
}

interface LaunchHeadroom {
  bandwidthLeft: number;
  countLeft: number;
}

function launchHeadroom(groups: readonly DroneGroup[], limits: DroneLaunchLimits): LaunchHeadroom {
  const bandwidthUsed = groups.reduce((sum, group) => {
    const each = limits.bandwidthOf(group.typeId);
    return group.inSpace > 0 && Number.isFinite(each) ? sum + group.inSpace * each : sum;
  }, 0);
  return {
    bandwidthLeft: limits.bandwidthTotal - bandwidthUsed,
    countLeft: limits.maxActive - groups.reduce((sum, group) => sum + group.inSpace, 0),
  };
}

function launchable(each: number, headroom: LaunchHeadroom): number {
  const byBandwidth = !Number.isFinite(each)
    ? 0
    : each > 0
      ? Math.floor(headroom.bandwidthLeft / each)
      : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(headroom.countLeft, byBandwidth));
}

export function droneLaunchRoom(
  fitting: Fitting,
  typeId: number,
  limits: DroneLaunchLimits | null
): number {
  if (limits === null) return Infinity;
  return launchable(limits.bandwidthOf(typeId), launchHeadroom(droneGroups(fitting), limits));
}

export function launchDrones(
  fitting: Fitting,
  limits: DroneLaunchLimits,
  onlyTypeId?: number
): Fitting {
  const groups = droneGroups(fitting);
  const headroom = launchHeadroom(groups, limits);
  let next = fitting;
  for (const group of groups) {
    if (headroom.countLeft <= 0) break;
    if (onlyTypeId !== undefined && group.typeId !== onlyTypeId) continue;
    const each = limits.bandwidthOf(group.typeId);
    const launched = Math.min(group.inBay, launchable(each, headroom));
    if (launched === 0) continue;
    next = setDroneCounts(next, group.typeId, {
      inSpace: group.inSpace + launched,
      inBay: group.inBay - launched,
    });
    headroom.bandwidthLeft -= launched * each;
    headroom.countLeft -= launched;
  }
  return next;
}

export function launchNewDrone(
  fitting: Fitting,
  typeId: number,
  bay: DroneBay | null,
  limits: DroneLaunchLimits | null
): Fitting {
  const added = addDronesWithinBay(fitting, typeId, 1, bay);
  if (added === fitting || limits === null) return added;
  const launched = launchDrones(added, limits, typeId);
  const isNew = !fitting.drones.some((drone) => drone.typeId === typeId);
  const headroom = launchHeadroom(droneGroups(launched), limits);
  if (
    isNew &&
    !Number.isFinite(limits.bandwidthOf(typeId)) &&
    headroom.bandwidthLeft > 0 &&
    headroom.countLeft >= 1
  ) {
    return setDroneCounts(launched, typeId, { inSpace: 1, inBay: 0 });
  }
  return launched;
}

export function recallDrones(fitting: Fitting, typeId: number): Fitting {
  const group = droneGroupOf(fitting, typeId);
  if (!group || group.inSpace === 0) return fitting;
  return setDroneCounts(fitting, typeId, { inSpace: 0, inBay: droneCarried(group) });
}

const MODULE_STATES: readonly FittingItemState[] = ['offline', 'online', 'active', 'overload'];

export function reachableModuleStates(
  maxState: FittingItemState,
  shown: FittingItemState
): FittingItemState[] {
  const states = MODULE_STATES.slice(0, MODULE_STATES.indexOf(maxState) + 1);
  if (!states.includes(shown)) states.push(shown);
  return states;
}

export function nextModuleState(
  shown: FittingItemState,
  maxState: FittingItemState
): FittingItemState {
  const states = reachableModuleStates(maxState, shown);
  return states[(states.indexOf(shown) + 1) % states.length];
}

export function shownModuleState(
  slot: FittingSlotKind,
  reached: FittingItemState | undefined,
  asked: FittingItemState
): FittingItemState {
  return slot === 'subsystem' ? 'online' : (reached ?? asked);
}

export function addDrones(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const current = droneGroupOf(fitting, typeId);
  return setDroneCounts(fitting, typeId, {
    inSpace: current?.inSpace ?? 0,
    inBay: (current?.inBay ?? 0) + quantity,
  });
}

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
  if (!placed && whole > 0) cargo.push({ typeId, quantity: whole });
  return { ...fitting, cargo };
}

export function addCargo(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const whole = wholeCount(quantity);
  if (whole === 0) return fitting;
  const held = cargoQuantity(fitting.cargo, typeId);
  if (held === 0) return { ...fitting, cargo: [...fitting.cargo, { typeId, quantity: whole }] };
  return setCargoQuantity(fitting, typeId, held + whole);
}

export function takeCargo(fitting: Fitting, typeId: number, quantity: number): Fitting {
  const held = cargoQuantity(fitting.cargo, typeId);
  const taken = Math.min(wholeCount(quantity), held);
  if (taken === 0) return fitting;
  return setCargoQuantity(fitting, typeId, held - taken);
}

export function cargoVolumeUsed(
  fitting: Pick<Fitting, 'cargo'>,
  volumeOf: (typeId: number) => number
): number {
  return fitting.cargo.reduce((sum, item) => sum + volumeOf(item.typeId) * item.quantity, 0);
}

export function cargoGroups(fitting: Fitting): FittingCargoItem[] {
  const groups = new Map<number, number>();
  for (const item of fitting.cargo) {
    groups.set(item.typeId, (groups.get(item.typeId) ?? 0) + item.quantity);
  }
  return [...groups].map(([typeId, quantity]) => ({ typeId, quantity }));
}

export function droneBayUsed(fitting: Fitting, volumeOf: (typeId: number) => number): number {
  return fitting.drones.reduce((sum, drone) => sum + volumeOf(drone.typeId) * drone.quantity, 0);
}

export interface DroneBay {
  capacity: number;
  volumeOf: (typeId: number) => number;
}

export function droneRoom(fitting: Fitting, typeId: number, bay: DroneBay | null): number {
  if (bay === null) return Infinity;
  const volume = bay.volumeOf(typeId);
  if (volume <= 0) return Infinity;
  const free = bay.capacity - droneBayUsed(fitting, bay.volumeOf);
  return Math.max(0, Math.floor(free / volume + 1e-9));
}

export function addDronesWithinBay(
  fitting: Fitting,
  typeId: number,
  quantity: number,
  bay: DroneBay | null
): Fitting {
  const adding = Math.min(quantity, droneRoom(fitting, typeId, bay));
  return adding >= 1 ? addDrones(fitting, typeId, adding) : fitting;
}

function droneGroupOf(fitting: Fitting, typeId: number): DroneGroup | undefined {
  return droneGroups(fitting).find((entry) => entry.typeId === typeId);
}

export function droneCarried(group: DroneGroup | undefined): number {
  return group ? group.inSpace + group.inBay : 0;
}

export function droneCarriedMax(fitting: Fitting, typeId: number, bay: DroneBay | null): number {
  const group = droneGroupOf(fitting, typeId);
  return droneCarried(group) + droneRoom(fitting, typeId, bay);
}

export function setDronesCarried(
  fitting: Fitting,
  typeId: number,
  count: number,
  bay: DroneBay | null
): Fitting {
  const group = droneGroupOf(fitting, typeId);
  const total = wholeCount(Math.min(count, droneCarriedMax(fitting, typeId, bay)));
  const inSpace = Math.min(group?.inSpace ?? 0, total);
  return setDroneCounts(fitting, typeId, { inSpace, inBay: total - inSpace });
}

export function droneLaunchedMax(
  fitting: Fitting,
  typeId: number,
  launch: DroneLaunchLimits | null
): number {
  const group = droneGroupOf(fitting, typeId);
  return Math.min(
    droneCarried(group),
    (group?.inSpace ?? 0) + droneLaunchRoom(fitting, typeId, launch)
  );
}

export function setDronesLaunched(
  fitting: Fitting,
  typeId: number,
  count: number,
  launch: DroneLaunchLimits | null
): Fitting {
  const group = droneGroupOf(fitting, typeId);
  if (!group) return fitting;
  const inSpace = wholeCount(Math.min(count, droneLaunchedMax(fitting, typeId, launch)));
  return setDroneCounts(fitting, typeId, { inSpace, inBay: droneCarried(group) - inSpace });
}

export function droneTotals(fitting: Fitting): { inSpace: number; carried: number } {
  return droneGroups(fitting).reduce(
    (sum, group) => ({
      inSpace: sum.inSpace + group.inSpace,
      carried: sum.carried + droneCarried(group),
    }),
    { inSpace: 0, carried: 0 }
  );
}
