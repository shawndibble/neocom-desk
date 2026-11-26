import type { ImproveGoal } from './improve';
import { scoredJobs, type Job } from './improveGroups';
import type { GainMetric } from '../skillGains';

export const IMPROVE_JOBS = ['pve', 'pvp', 'explore'] as const;
export type ImproveJob = (typeof IMPROVE_JOBS)[number];
export const DEFAULT_IMPROVE_JOB: ImproveJob = 'pve';

export const EXPLORE_SPACES = ['dangerous', 'safe'] as const;
export type ExploreSpace = (typeof EXPLORE_SPACES)[number];
export const DEFAULT_EXPLORE_SPACE: ExploreSpace = 'dangerous';

export const FREED_JOBS: Record<ImproveJob, readonly Job[]> = {
  pve: ['scram', 'web'],
  pvp: [],
  explore: [],
};

export interface JobWeights {
  dps: number;
  ehp: number;
  sustained: number;
  speed: number;
  align: number;
  lockRange: number;
  reach: number;
  capacitor: number;
}

export const JOB_WEIGHTS: Record<ImproveJob, JobWeights> = {
  pve: {
    dps: 1,
    ehp: 1,
    sustained: 1,
    speed: 0.25,
    align: 0.25,
    lockRange: 0.25,
    reach: 0.5,
    capacitor: 0.25,
  },
  pvp: {
    dps: 1,
    ehp: 1,
    sustained: 0.25,
    speed: 1,
    align: 0.75,
    lockRange: 0.5,
    reach: 0.5,
    capacitor: 0.25,
  },
  explore: {
    dps: 0.25,
    ehp: 0.5,
    sustained: 0.5,
    speed: 0.75,
    align: 1,
    lockRange: 0.25,
    reach: 0.25,
    capacitor: 0.25,
  },
};

export function overallWeightsOf(job: ImproveJob): Partial<Record<GainMetric, number>> {
  const w = JOB_WEIGHTS[job];
  return {
    dps: w.dps,
    ehp: w.ehp,
    activeTank: w.sustained,
    speed: w.speed,
    align: w.align,
    lockRange: w.lockRange,
    optimal: w.reach,
    falloff: w.reach,
    tracking: w.reach,
    capacitor: w.capacitor,
  };
}

export const HELD_EVERY_COPY: Record<ImproveJob, readonly Job[]> = {
  pve: [],
  pvp: [],
  explore: ['cloak', 'analyzer', 'probeLauncher', 'propulsion', 'warpCore'],
};

export interface JobSetting {
  job: ImproveJob;
  space: ExploreSpace;
  noPropulsion?: boolean;
}

export const jobSettingOf = (
  job: ImproveJob,
  space: ExploreSpace = DEFAULT_EXPLORE_SPACE,
  noPropulsion = false
): JobSetting => ({ job, space, ...(noPropulsion ? { noPropulsion } : {}) });

export type PropulsionNeed = 'any' | 'mwd';
export const JOB_NEEDS: Record<ImproveJob, { propulsion: PropulsionNeed | null }> = {
  pve: { propulsion: 'any' },
  pvp: { propulsion: null },
  explore: { propulsion: 'mwd' },
};

export function propulsionNeedOf(setting: JobSetting | undefined): PropulsionNeed | null {
  if (!setting || (setting.job === 'pve' && setting.noPropulsion)) return null;
  return JOB_NEEDS[setting.job].propulsion;
}

export const holdsTankModules = (setting: JobSetting | undefined): boolean =>
  setting?.job === 'explore' && setting.space === 'dangerous';

export const LIMIT_STATS = ['damage', 'speed', 'ehp', 'sustained'] as const;
export type LimitStat = (typeof LIMIT_STATS)[number];
export type DropLimits = Partial<Record<LimitStat, number>>;

const DROP = 0.1;
const DROP_LIMITS: Record<ImproveJob, DropLimits> = {
  pve: { damage: DROP },
  pvp: { damage: DROP, speed: DROP, ehp: DROP },
  explore: { speed: DROP },
};
const DANGEROUS_EXPLORE_LIMITS: DropLimits = { ehp: DROP, sustained: DROP };

const GOAL_OWN_STAT: Partial<Record<ImproveGoal, LimitStat>> = {
  damage: 'damage',
  tank: 'ehp',
  speed: 'speed',
};

export function dropLimitsOf(goal: ImproveGoal, setting: JobSetting | undefined): DropLimits {
  if (!setting) return {};
  const limits: DropLimits = {
    ...DROP_LIMITS[setting.job],
    ...(holdsTankModules(setting) ? DANGEROUS_EXPLORE_LIMITS : {}),
  };
  const own = GOAL_OWN_STAT[goal];
  if (own) delete limits[own];
  return limits;
}

const TANK_STATS: readonly LimitStat[] = ['ehp', 'sustained'];
export const isTankStat = (stat: LimitStat): boolean => TANK_STATS.includes(stat);

export function swapLimitsOf(goal: ImproveGoal, setting: JobSetting | undefined): DropLimits {
  if (!holdsTankModules(setting)) return {};
  const limits = dropLimitsOf(goal, setting);
  return Object.fromEntries(
    Object.entries(limits).filter(([stat]) => isTankStat(stat as LimitStat))
  ) as DropLimits;
}

export function firstLimitBreach(
  limits: DropLimits,
  before: Record<LimitStat, number>,
  after: Record<LimitStat, number>
): LimitStat | null {
  for (const stat of LIMIT_STATS) {
    const limit = limits[stat];
    if (limit === undefined || before[stat] <= 0) continue;
    if ((before[stat] - after[stat]) / before[stat] > limit) return stat;
  }
  return null;
}

export function unguardedJobs(goal: ImproveGoal, job?: ImproveJob): readonly Job[] {
  return job ? [...scoredJobs(goal), ...FREED_JOBS[job]] : scoredJobs(goal);
}

export const effectiveSpace = (space: ExploreSpace, carriesCombatDrones: boolean): ExploreSpace =>
  carriesCombatDrones ? 'dangerous' : space;

const COMBAT_DRONE_GROUP = 100;

export function searchSpace(
  job: ImproveJob,
  space: ExploreSpace,
  drones: readonly { typeId: number; quantity: number }[],
  groupOf: (typeId: number) => number | undefined
): ExploreSpace {
  if (job !== 'explore') return space;
  const combat = drones.some(
    (drone) => drone.quantity > 0 && groupOf(drone.typeId) === COMBAT_DRONE_GROUP
  );
  return effectiveSpace(space, combat);
}
