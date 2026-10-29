/**
 * The **Improve Job** (PvE, PvP, Explore; issue #5564, parent #5548, scope
 * decision `20261029-160515-improve-job-weights-freed-jobs-and-drop-limits`): what
 * the pilot flies the fit for. It frees module jobs the search may drop, sets
 * how Best overall weighs each stat, and caps how much a Makeover may give up.
 * Each job keeps its numbers in its own table entry, so tuning is a data
 * change. Pure data and small helpers; no job (absent) is today's behaviour.
 */
import type { ImproveGoal } from './improve';
import { scoredJobs, type Job } from './improveGroups';
import type { GainMetric } from './skillGains';

export const IMPROVE_JOBS = ['pve', 'pvp', 'explore'] as const;
export type ImproveJob = (typeof IMPROVE_JOBS)[number];
export const DEFAULT_IMPROVE_JOB: ImproveJob = 'pve';

/** Where an Explore fit flies: Dangerous keeps its tank, Safe may give it up. */
export const EXPLORE_SPACES = ['dangerous', 'safe'] as const;
export type ExploreSpace = (typeof EXPLORE_SPACES)[number];
export const DEFAULT_EXPLORE_SPACE: ExploreSpace = 'dangerous';

/** Module jobs a job no longer protects: the search may drop the last module doing one. */
export const FREED_JOBS: Record<ImproveJob, readonly Job[]> = {
  pve: ['scram', 'web'],
  pvp: [],
  explore: [],
};

/** The metrics Best overall weighs; `sustained` is the sustained-tank term `improveOverall` swaps in for active repair. */
export interface JobWeights {
  dps: number;
  ehp: number;
  sustained: number;
  speed: number;
  align: number;
  lockRange: number;
  /** Optimal range, falloff and tracking. */
  reach: number;
  capacitor: number;
}

/** Multipliers on the Best overall terms, one table per job. Stats not listed (role stats) count whole. */
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
    // Not in the issue's start values: an explorer rarely shoots, so reach counts like lock range.
    reach: 0.25,
    capacitor: 0.25,
  },
};

/** `JOB_WEIGHTS` as the multipliers `improveOverall` reads, per gain metric. */
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

/** Jobs whose every fitted copy stays, not only the last: the explorer's kit (two analyzers are two hacks). */
export const HELD_EVERY_COPY: Record<ImproveJob, readonly Job[]> = {
  pve: [],
  pvp: [],
  explore: ['cloak', 'analyzer', 'probeLauncher', 'propulsion'],
};

/** Whether tank modules stay tank modules: Explore in dangerous space, whatever the score says of a lost repairer. */
export const holdsTankModules = (
  job: ImproveJob | undefined,
  space: ExploreSpace = DEFAULT_EXPLORE_SPACE
): boolean => job === 'explore' && space === 'dangerous';

/** The figures a drop limit reads. */
export const LIMIT_STATS = ['damage', 'speed', 'ehp', 'sustained'] as const;
export type LimitStat = (typeof LIMIT_STATS)[number];
/** The most a figure may fall, as a fraction of the fit's own. */
export type DropLimits = Partial<Record<LimitStat, number>>;

const DROP = 0.1;
const DROP_LIMITS: Record<ImproveJob, DropLimits> = {
  pve: { damage: DROP },
  pvp: { damage: DROP, speed: DROP, ehp: DROP },
  explore: { speed: DROP },
};
/** What Explore adds in dangerous space, where a lost tank can cost the ship. */
const DANGEROUS_EXPLORE_LIMITS: DropLimits = { ehp: DROP, sustained: DROP };

/** The figure a goal itself raises: its limit never binds, whatever the job says. */
const GOAL_OWN_STAT: Partial<Record<ImproveGoal, LimitStat>> = {
  damage: 'damage',
  tank: 'ehp',
  speed: 'speed',
};

/** The limits of `job` for `goal`; empty with no job. `space` only matters for Explore (default Dangerous). */
export function dropLimitsOf(
  job: ImproveJob | undefined,
  space: ExploreSpace = DEFAULT_EXPLORE_SPACE,
  goal: ImproveGoal
): DropLimits {
  if (!job) return {};
  const limits: DropLimits = {
    ...DROP_LIMITS[job],
    ...(job === 'explore' && space === 'dangerous' ? DANGEROUS_EXPLORE_LIMITS : {}),
  };
  const own = GOAL_OWN_STAT[goal];
  if (own) delete limits[own];
  return limits;
}

/** The limits a single swap is held to: Explore Dangerous guards tank on every swap, no other job guards one. */
export function swapLimitsOf(
  job: ImproveJob | undefined,
  space: ExploreSpace = DEFAULT_EXPLORE_SPACE,
  goal: ImproveGoal
): DropLimits {
  if (job !== 'explore' || space !== 'dangerous') return {};
  const { ehp, sustained } = dropLimitsOf(job, space, goal);
  return {
    ...(ehp === undefined ? {} : { ehp }),
    ...(sustained === undefined ? {} : { sustained }),
  };
}

/** The first limited figure that fell further than its limit; a figure the fit never had cannot fall. */
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

/** The module jobs the search may drop for `goal` under `job`: the goal's scored jobs plus the job's freed ones. */
export function unguardedJobs(goal: ImproveGoal, job?: ImproveJob): readonly Job[] {
  return job ? [...scoredJobs(goal), ...FREED_JOBS[job]] : scoredJobs(goal);
}
