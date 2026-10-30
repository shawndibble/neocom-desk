/**
 * The hand-written pruning table behind Improve Reach "Rework" and the empty
 * slot fills (scope decision `20261024-171917`, sizing in the Free slots
 * decision): which inventory groups can move each Improve Goal's stat, which
 * groups are tank modules (and on which side), and which groups do a job no
 * damage or EHP score notices when it is lost. A good idea is missed only
 * when its group is not listed here, so a pilot who finds one adds the group
 * id. Pure data; group ids are the SDE's `groupID`.
 */
import type { ImproveGoal } from './improve';

export type DefenseSide = 'shield' | 'armor';

/** Shield tank: extenders, boosters, hardeners, amplifiers, rechargers, ancillary boosters, power relays, flux coils; rigs 774. */
export const SHIELD_TANK_GROUPS: readonly number[] = [38, 40, 77, 295, 338, 39, 1156, 57, 770, 774];

/** Armor tank: plates, repairers, hardeners, membranes, coatings, reactive hardeners, ancillary repairers; rigs 773. */
export const ARMOR_TANK_GROUPS: readonly number[] = [329, 62, 328, 326, 98, 1150, 1199, 773];

/** Damage Control and Reinforced Bulkheads: hull tank, useful on either side. */
export const COMMON_TANK_GROUPS: readonly number[] = [60, 78];

/** Every tank module group: the modules a Defense Choice frees. */
export const TANK_GROUPS: ReadonlySet<number> = new Set([
  ...SHIELD_TANK_GROUPS,
  ...ARMOR_TANK_GROUPS,
  ...COMMON_TANK_GROUPS,
]);

/** Ballistic Control, Gyrostabilizer, Magnetic Field Stabilizer, Heat Sink, Drone Damage Amplifier, Missile Guidance Computer, weapon rigs (775–779). */
const DAMAGE_GROUPS: readonly number[] = [367, 59, 302, 205, 645, 1396, 775, 776, 777, 779];

/** Tracking Enhancer, Tracking Computer, Sensor Booster, weapon ambit and locus rigs. */
const REACH_GROUPS: readonly number[] = [211, 213, 212, 775, 776, 777];

/** Afterburner and Microwarpdrive, Inertial Stabilizers, Nanofiber, Overdrive Injector, Hyperspatial rigs. */
const SPEED_GROUPS: readonly number[] = [46, 762, 763, 764, 782];

/** Data and Relic Analyzer 538, Scan Rangefinding and Pinpointing Array 1223, Scan Acquisition Array 1238, Survey Scanner 49, scanning rigs 1233 (the Memetic, Emission, Gravity and Signal rigs), then the speed groups. */
const EXPLORE_GROUPS: readonly number[] = [538, 1223, 1238, 49, 1233, ...SPEED_GROUPS];

/** The rigs Explore better swaps a surplus CPU or powergrid rig for: scanning and hacking rigs, and the navigation rigs that speed or align. */
export const EXPLORE_RIG_GROUPS: readonly number[] = [1233, 782];

/** Engineering rigs (Processor Overclocking Unit, Ancillary Current Router, capacitor rigs): the CPU, powergrid and capacitor rigs a fit may not need. A needed capacitor rig is held by the capacitor Guardrail. */
export const RESOURCE_RIG_GROUPS: readonly number[] = [781];

/** Cap Recharger, Capacitor Power Relay, Capacitor Flux Coil, capacitor rigs. */
const CAP_GROUPS: readonly number[] = [43, 767, 768, 781];

/** Mining Laser, Strip Miner (and Ice Harvester), Deep Core Strip Miner, Mining Laser Upgrade, mining rigs (1232). */
const MINING_GROUPS: readonly number[] = [54, 464, 483, 546, 1232];

/** Expanded Cargohold, and the cargo-and-navigation rig group 782 (Cargohold Optimization, Polycarbon Engine Housing and the like). */
const HAUL_GROUPS: readonly number[] = [765, 782];

/** Inertial Stabilizers, Nanofiber Internal Structure, and the navigation rigs (782) that cut inertia or mass. */
const ALIGN_GROUPS: readonly number[] = [762, 763, 782];

/** Remote Shield Booster (41), Remote Armor Repairer (325), Remote Hull Repairer (585), and the ancillary remote boosters and repairers. */
const REPAIR_GROUPS: readonly number[] = [41, 325, 585, 1697, 1698];

/** Remote Capacitor Transmitter. */
const TRANSFER_GROUPS: readonly number[] = [67];

/** Warp Scrambler (scramblers and disruptors) and Stasis Webifier. */
const TACKLE_GROUPS: readonly number[] = [52, 65];

/** ECM, Remote Sensor Dampener, Weapon Disruptor, Target Painter. */
const EWAR_GROUPS: readonly number[] = [201, 208, 291, 379];

/** Command Burst, Compressor, Industrial Core. */
const COMMAND_GROUPS: readonly number[] = [1770, 4174, 515];

/** The module groups, beyond a module's own, that Rework tries for each Improve Goal. The tank groups are added per Defense Choice. */
const GOAL_GROUPS: Record<ImproveGoal, readonly number[]> = {
  overall: [...DAMAGE_GROUPS, ...REACH_GROUPS, ...SPEED_GROUPS, ...CAP_GROUPS],
  damage: DAMAGE_GROUPS,
  tank: [],
  speed: SPEED_GROUPS,
  reach: REACH_GROUPS,
  cheaper: [],
  mining: MINING_GROUPS,
  haul: HAUL_GROUPS,
  align: ALIGN_GROUPS,
  warp: ALIGN_GROUPS,
  repair: REPAIR_GROUPS,
  transfer: TRANSFER_GROUPS,
  tackle: TACKLE_GROUPS,
  ewar: EWAR_GROUPS,
  command: COMMAND_GROUPS,
  explore: EXPLORE_GROUPS,
};

/** The goals whose score includes the fit's tank. */
export const TANK_GOALS: ReadonlySet<ImproveGoal> = new Set<ImproveGoal>(['tank', 'overall']);

/** The groups Rework (and a fill) may use for `goal`, with the tank groups of `sides`. */
export function reworkGroups(goal: ImproveGoal, sides: readonly DefenseSide[]): number[] {
  const groups = new Set(GOAL_GROUPS[goal]);
  if (TANK_GOALS.has(goal)) {
    for (const id of COMMON_TANK_GROUPS) groups.add(id);
    for (const side of sides)
      for (const id of side === 'shield' ? SHIELD_TANK_GROUPS : ARMOR_TANK_GROUPS) groups.add(id);
  }
  return [...groups];
}

/** The side a tank group belongs to; null for a group on neither (or common to both). */
export function sideOf(groupId: number): DefenseSide | null {
  if (SHIELD_TANK_GROUPS.includes(groupId)) return 'shield';
  if (ARMOR_TANK_GROUPS.includes(groupId)) return 'armor';
  return null;
}

export type Job =
  | 'propulsion'
  | 'scram'
  | 'web'
  | 'ewar'
  | 'drain'
  | 'fleet'
  | 'cap'
  | 'remoteRepair'
  | 'capTransfer'
  | 'mining'
  | 'cloak'
  | 'analyzer'
  | 'probeLauncher'
  | 'scanArray'
  | 'acquisitionArray'
  | 'surveyScanner'
  | 'salvage'
  | 'tractor'
  | 'cyno'
  | 'sphereLauncher'
  | 'smartBomb'
  | 'warpCore';

/**
 * The groups that do a job no damage or EHP score notices when it is lost.
 * Each is its own job, so one goal's Rework never drops another's last module.
 * Propulsion is the afterburners and MWDs (46) and the micro jump drives (1189).
 * SDE group ids beyond the combat ones: Data Analyzer and Relic Analyzer 538,
 * Scan Probe Launcher 481, Scan Rangefinding and Pinpointing Array 1223,
 * Scan Acquisition Array 1238, Survey Scanner 49, Salvager 1122, Tractor Beam
 * 650, Cynosural Field Generator 658, Interdiction Sphere Launcher 589,
 * Smart Bomb 72.
 */
const JOB_GROUPS: Record<Job, readonly number[]> = {
  propulsion: [46, 1189],
  scram: [52],
  web: [65],
  ewar: [201, 80, 208, 291, 379],
  drain: [71, 68],
  fleet: [1770, 4174, 515],
  cap: [43, 76, 767, 768],
  remoteRepair: [325, 41, 585, 1697, 1698],
  capTransfer: [67],
  mining: [54, 464, 483],
  cloak: [330],
  analyzer: [538],
  probeLauncher: [481],
  scanArray: [1223],
  acquisitionArray: [1238],
  surveyScanner: [49],
  salvage: [1122],
  tractor: [650],
  cyno: [658],
  sphereLauncher: [589],
  smartBomb: [72],
  // No score sees warp strength, so a warp core stabilizer (what gets a ship away when pointed) is never dropped for one.
  warpCore: [315],
};

const JOB_OF_GROUP = new Map<number, Job>(
  (Object.entries(JOB_GROUPS) as [Job, readonly number[]][]).flatMap(([job, groups]) =>
    groups.map((group): [number, Job] => [group, job])
  )
);

/** The job a module group does, or null when it does none of the protected ones. */
export function jobOf(groupId: number | undefined): Job | null {
  return groupId === undefined ? null : (JOB_OF_GROUP.get(groupId) ?? null);
}

/** The jobs `goal` scores, so losing them shows in the score and Rework may. */
export function scoredJobs(goal: ImproveGoal): readonly Job[] {
  if (goal === 'speed') return ['propulsion'];
  if (goal === 'overall') return ['cap'];
  if (goal === 'mining') return ['mining'];
  if (goal === 'repair') return ['remoteRepair'];
  if (goal === 'transfer') return ['capTransfer'];
  if (goal === 'tackle') return ['scram', 'web'];
  if (goal === 'ewar') return ['ewar'];
  if (goal === 'command') return ['fleet'];
  // Explore better scores no job: the score cannot see a lost probe launcher, so every explorer module stays guarded.
  return [];
}

/** At most one of these fits (Damage Control, a cloak): a second is never offered. */
export const UNIQUE_GROUPS: ReadonlySet<number> = new Set([60, 330]);
