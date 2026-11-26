import type { ImproveGoal } from './improve';

export type DefenseSide = 'shield' | 'armor';

export const SHIELD_TANK_GROUPS: readonly number[] = [38, 40, 77, 295, 338, 39, 1156, 57, 770, 774];

export const ARMOR_TANK_GROUPS: readonly number[] = [329, 62, 328, 326, 98, 1150, 1199, 773];

export const COMMON_TANK_GROUPS: readonly number[] = [60, 78];

export const TANK_GROUPS: ReadonlySet<number> = new Set([
  ...SHIELD_TANK_GROUPS,
  ...ARMOR_TANK_GROUPS,
  ...COMMON_TANK_GROUPS,
]);

const DAMAGE_GROUPS: readonly number[] = [367, 59, 302, 205, 645, 1396, 775, 776, 777, 779];

const REACH_GROUPS: readonly number[] = [211, 213, 212, 775, 776, 777];

const SPEED_GROUPS: readonly number[] = [46, 762, 763, 764, 782];

const EXPLORE_GROUPS: readonly number[] = [538, 1223, 1238, 49, 1233, ...SPEED_GROUPS];

export const EXPLORE_RIG_GROUPS: readonly number[] = [1233, 782];

export const RESOURCE_RIG_GROUPS: readonly number[] = [781];

const CAP_GROUPS: readonly number[] = [43, 767, 768, 781];

const MINING_GROUPS: readonly number[] = [54, 464, 483, 546, 1232];

const HAUL_GROUPS: readonly number[] = [765, 782];

const ALIGN_GROUPS: readonly number[] = [762, 763, 782];

const REPAIR_GROUPS: readonly number[] = [41, 325, 585, 1697, 1698];

const TRANSFER_GROUPS: readonly number[] = [67];

const TACKLE_GROUPS: readonly number[] = [52, 65];

const EWAR_GROUPS: readonly number[] = [201, 208, 291, 379];

const COMMAND_GROUPS: readonly number[] = [1770, 4174, 515];

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

export const TANK_GOALS: ReadonlySet<ImproveGoal> = new Set<ImproveGoal>(['tank', 'overall']);

export function reworkGroups(goal: ImproveGoal, sides: readonly DefenseSide[]): number[] {
  const groups = new Set(GOAL_GROUPS[goal]);
  if (TANK_GOALS.has(goal)) {
    for (const id of COMMON_TANK_GROUPS) groups.add(id);
    for (const side of sides)
      for (const id of side === 'shield' ? SHIELD_TANK_GROUPS : ARMOR_TANK_GROUPS) groups.add(id);
  }
  return [...groups];
}

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
  warpCore: [315],
};

const JOB_OF_GROUP = new Map<number, Job>(
  (Object.entries(JOB_GROUPS) as [Job, readonly number[]][]).flatMap(([job, groups]) =>
    groups.map((group): [number, Job] => [group, job])
  )
);

export function jobOf(groupId: number | undefined): Job | null {
  return groupId === undefined ? null : (JOB_OF_GROUP.get(groupId) ?? null);
}

export function scoredJobs(goal: ImproveGoal): readonly Job[] {
  if (goal === 'speed') return ['propulsion'];
  if (goal === 'overall') return ['cap'];
  if (goal === 'mining') return ['mining'];
  if (goal === 'repair') return ['remoteRepair'];
  if (goal === 'transfer') return ['capTransfer'];
  if (goal === 'tackle') return ['scram', 'web'];
  if (goal === 'ewar') return ['ewar'];
  if (goal === 'command') return ['fleet'];
  return [];
}

export const UNIQUE_GROUPS: ReadonlySet<number> = new Set([60, 330]);
