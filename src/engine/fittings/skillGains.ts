/**
 * "What to train" for one Fitting: which single +1 skill level improves it
 * most. The candidates are the skills the engine reports as a modifier source
 * anywhere on the fit (`calculate(fit, { sources: true })`, worked out with
 * every skill at V so an untrained skill that would help still shows up),
 * minus the ones the pilot already has at V. Each is then worked out once at
 * its next level through an injected `compare`, so this module needs no
 * engine and no event loop of its own. Pure.
 */
import type { AttributeWithSources } from './affectedBy';
import type { AppliedWeapon } from './appliedDps';
import { alignTimeSeconds } from './stats';
import type { PlanEntry } from '../types';
import type { FittingStats } from './types';
import { round } from './fittingStatFields';
import { diffFittingStats, type FittingStatsDelta } from './variationDelta';

/** One calculated object's attributes, and its loaded charge's — the shape of the engine's `ItemResult`. */
export interface SourcedResult {
  attributes: ReadonlyMap<number, AttributeWithSources>;
  charge?: SourcedResult | undefined;
}

/**
 * Every skill that modifies a published attribute of any of `results` (the
 * ship, its mode, the character, each item and its charge).
 */
export function skillSourceTypeIds(results: Iterable<SourcedResult>): Set<number> {
  const ids = new Set<number>();
  const visit = (result: SourcedResult) => {
    for (const [attributeId, attribute] of result.attributes) {
      if (attributeId <= 0) continue;
      for (const source of attribute.sources ?? []) {
        if (source.from.type === 'skill') ids.add(source.from.type_id);
      }
    }
    if (result.charge) visit(result.charge);
  };
  for (const result of results) visit(result);
  return ids;
}

export interface SkillGainCandidate {
  skillTypeId: number;
  /** The pilot's level now; 0 when untrained. */
  fromLevel: number;
  toLevel: number;
}

/** `skillTypeIds` the pilot hasn't got at V, each at its next level, in id order. */
export function skillGainCandidates(
  skillTypeIds: Iterable<number>,
  levels: ReadonlyMap<number, number>
): SkillGainCandidate[] {
  const candidates: SkillGainCandidate[] = [];
  for (const skillTypeId of new Set(skillTypeIds)) {
    const fromLevel = levels.get(skillTypeId) ?? 0;
    if (fromLevel >= 5) continue;
    candidates.push({ skillTypeId, fromLevel, toLevel: fromLevel + 1 });
  }
  return candidates.sort((a, b) => a.skillTypeId - b.skillTypeId);
}

/** What a combat pilot ranks by. */
const COMBAT_METRICS = [
  'dps',
  'ehp',
  'activeTank',
  'speed',
  'align',
  'capacitor',
  'lockRange',
] as const;

/**
 * The stats the Variations delta doesn't show, each described as its own
 * change: the guns' and launchers' reach, then what a miner, hauler,
 * logistics or jump pilot ranks by. Each is zero on a fit with no such role —
 * no guns, no miners, a fit that shoots, no remote repairers, no jump drive —
 * so a combat fit's list never grows a cargo or mining row.
 */
export const ROLE_METRICS = [
  'optimal',
  'falloff',
  'tracking',
  'miningYield',
  'hold',
  'remoteRepair',
  'jumpRange',
  'burstStrength',
  'burstRange',
  'burstDuration',
  'burstReload',
  'compressionRange',
  'coreFuel',
] as const;
export type RoleMetric = (typeof ROLE_METRICS)[number];

/** The stats a pilot ranks by; `overall` is all of them together. */
export const GAIN_METRICS = [...COMBAT_METRICS, ...ROLE_METRICS] as const;
export type GainMetric = (typeof GAIN_METRICS)[number];
export type GainSort = 'overall' | GainMetric;

/**
 * How much each metric counts towards `overall` (scope decision
 * `20261002-234731-what-to-train-weighted-overall-weapon-reach-ranked`): damage, tank and a role's own
 * output whole; mobility and reach half; time until the capacitor runs dry
 * (or stable % points) a quarter — a few seconds more of it must not outrank
 * real damage, nor running dry sooner bury a big DPS gain. Absent: 1.
 */
const OVERALL_WEIGHTS: Partial<Record<GainMetric, number>> = {
  speed: 0.5,
  align: 0.5,
  lockRange: 0.5,
  optimal: 0.5,
  falloff: 0.5,
  tracking: 0.5,
  capacitor: 0.25,
};

/** Each metric's improvement (positive: better), plus `overall`, their weighted sum. */
export type GainMetrics = Record<GainSort, number>;

/** `(after − before) / |before|`, with something from nothing counting as a whole gain. */
function relative(before: number, after: number): number {
  if (before === after) return 0;
  if (before === 0) return after > 0 ? 1 : -1;
  return (after - before) / Math.abs(before);
}

function capacitorGain(before: FittingStats['capacitor'], after: FittingStats['capacitor']) {
  if (before.stable && after.stable)
    return (after.stablePercentage - before.stablePercentage) / 100;
  if (!before.stable && !after.stable)
    return relative(before.depletesInSeconds, after.depletesInSeconds);
  return after.stable ? 1 : -1;
}

const activeTank = (s: FittingStats) => s.repair.shield + s.repair.armor + s.repair.hull;
const alignTime = (s: FittingStats) => alignTimeSeconds(s.navigation.mass, s.navigation.agility);
const isArmed = (s: FittingStats) => s.offense.dps > 0 || s.droneDps > 0;

type ShipWeapon = Extract<AppliedWeapon, { kind: 'turret' | 'missile' }>;
/** The fit's own firing guns and launchers, in fit order — not its drones or fighters. */
const shipWeapons = (s: FittingStats) =>
  s.applied.weapons.filter((w): w is ShipWeapon => w.kind === 'turret' || w.kind === 'missile');
const turrets = (s: FittingStats) =>
  shipWeapons(s).filter((w): w is Extract<ShipWeapon, { kind: 'turret' }> => w.kind === 'turret');

/** One role stat's before/after, at the digits it is shown with. */
export interface RoleChange {
  key: RoleMetric;
  before: number;
  after: number;
}

interface RoleField {
  key: RoleMetric;
  digits: number;
  /**
   * One figure per burst, compressor or the like, in fit order, which a +1
   * level never reorders. Compared item by item: a skill that raises only
   * the weaker of two bursts still moves this stat.
   */
  values: (s: FittingStats) => number[];
  /** Whether this fit's `before` has the role at all; absent: always. */
  applies?: (before: FittingStats) => boolean;
  /** Less is better: a reload, a fuel bill. The gain is scored the other way up. */
  lowerIsBetter?: boolean;
}

/**
 * Hold space counts only on a fit that fires nothing: on a warship a bigger
 * hold is noise, on a hauler or an Orca it is the point. Mining yield and
 * the rest need no such gate — a fit without them never changes them.
 */
const ROLE_FIELDS: readonly RoleField[] = [
  {
    key: 'optimal',
    digits: 1,
    values: (s) => shipWeapons(s).map((w) => (w.kind === 'turret' ? w.optimal : w.range) / 1000),
  },
  {
    key: 'falloff',
    digits: 1,
    values: (s) => turrets(s).map((w) => w.falloff / 1000),
  },
  {
    key: 'tracking',
    digits: 3,
    values: (s) => turrets(s).map((w) => w.tracking),
  },
  {
    key: 'miningYield',
    digits: 0,
    values: (s) => [s.mining.perHour],
  },
  {
    key: 'hold',
    digits: 0,
    values: (s) => [s.holds.cargo + s.holds.fleetHangar + s.holds.miningHold],
    applies: (before) => !isArmed(before),
  },
  {
    key: 'remoteRepair',
    digits: 1,
    values: (s) => [
      s.support.remoteRepair.shield + s.support.remoteRepair.armor + s.support.remoteRepair.hull,
    ],
  },
  {
    key: 'jumpRange',
    digits: 2,
    values: (s) => [s.jumpDrive?.rangeLightYears ?? 0],
  },
  {
    key: 'burstStrength',
    digits: 1,
    values: (s) => s.fleetSupport.bursts.map((burst) => Math.max(0, ...burst.strengths)),
  },
  {
    key: 'burstRange',
    digits: 1,
    values: (s) => s.fleetSupport.bursts.map((burst) => burst.rangeMeters / 1000),
  },
  {
    key: 'burstDuration',
    digits: 1,
    values: (s) => s.fleetSupport.bursts.map((burst) => burst.durationSeconds),
  },
  {
    key: 'burstReload',
    digits: 1,
    values: (s) => s.fleetSupport.bursts.map((burst) => burst.reloadSeconds),
    lowerIsBetter: true,
  },
  {
    key: 'compressionRange',
    digits: 1,
    values: (s) => s.fleetSupport.compressors.map((c) => c.rangeMeters / 1000),
  },
  {
    key: 'coreFuel',
    digits: 0,
    values: (s) => [s.fleetSupport.core?.fuelPerCycle ?? 0],
    lowerIsBetter: true,
  },
];

/**
 * Each role stat the +1 level changes, with its gain. Compared item by item
 * at the digits shown; where several move, the one that gains most is the one
 * reported. A lower-is-better figure that was nothing before has no gain to
 * speak of — a burst with no reload to shorten.
 */
function roleResults(
  before: FittingStats,
  after: FittingStats
): { change: RoleChange; gain: number }[] {
  const results: { change: RoleChange; gain: number }[] = [];
  for (const field of ROLE_FIELDS) {
    if (field.applies && !field.applies(before)) continue;
    const was = field.values(before);
    const now = field.values(after);
    let best: { change: RoleChange; gain: number } | null = null;
    for (let i = 0; i < Math.max(was.length, now.length); i++) {
      const b = round(was[i] ?? 0, field.digits);
      const a = round(now[i] ?? 0, field.digits);
      if (b === a || (field.lowerIsBetter && b === 0)) continue;
      const gain = field.lowerIsBetter ? -relative(b, a) : relative(b, a);
      if (best === null || gain > best.gain)
        best = { change: { key: field.key, before: b, after: a }, gain };
    }
    if (best) results.push(best);
  }
  return results;
}

/** Role stats the +1 level changes, after the rounding they display at. */
export function roleChanges(before: FittingStats, after: FittingStats): RoleChange[] {
  return roleResults(before, after).map(({ change }) => change);
}

/**
 * How much better `after` is than `before` in each tracked stat, as a
 * fraction of `before` — so a DPS gain and an EHP gain add up on one scale.
 * Align time is better lower; the capacitor is scored in stable-% points,
 * or relative depletion time, with turning stable a whole gain. `overall`
 * weighs each by `OVERALL_WEIGHTS` on a fit that shoots, except that the
 * capacitor turning stable (or unstable) always counts whole; on a hauler,
 * miner or other unarmed fit, align time and the like are what keep it
 * alive, so every metric counts whole.
 */
export function gainMetrics(before: FittingStats, after: FittingStats): GainMetrics {
  const roleGains = Object.fromEntries([
    ...ROLE_METRICS.map((key): [RoleMetric, number] => [key, 0]),
    ...roleResults(before, after).map(({ change, gain }) => [change.key, gain]),
  ]) as Record<RoleMetric, number>;
  const metrics: Record<GainMetric, number> = {
    dps: relative(before.offense.dps, after.offense.dps),
    ehp: relative(before.ehp, after.ehp),
    activeTank: relative(activeTank(before), activeTank(after)),
    speed: relative(before.navigation.maxVelocity, after.navigation.maxVelocity),
    align: -relative(alignTime(before), alignTime(after)),
    capacitor: capacitorGain(before.capacitor, after.capacitor),
    lockRange: relative(before.targeting.maxTargetRange, after.targeting.maxTargetRange),
    ...roleGains,
  };
  const flipped = before.capacitor.stable !== after.capacitor.stable;
  const weighted = isArmed(before);
  const weight = (metric: GainMetric) =>
    !weighted || (metric === 'capacitor' && flipped) ? 1 : (OVERALL_WEIGHTS[metric] ?? 1);
  const overall = GAIN_METRICS.reduce((sum, metric) => sum + metrics[metric] * weight(metric), 0);
  return { overall, ...metrics };
}

export interface SkillGain extends SkillGainCandidate {
  /** Every displayed stat the +1 level changes, as the Variations table words them. */
  delta: FittingStatsDelta;
  /** Weapon reach, mining, hold, remote-repair and jump-range changes, which `delta` leaves out. */
  roleChanges: RoleChange[];
  metrics: GainMetrics;
}

/** What one skill level does to a fit: `SkillGain` without the skill it is for. */
export type LevelGain = Pick<SkillGain, 'delta' | 'roleChanges' | 'metrics'>;

/**
 * One level worked out from the fit before and after it — also for a level
 * that changes nothing, which the ranking leaves out but a pilot picking that
 * level still wants to see as "no change".
 */
export function levelGain(before: FittingStats, after: FittingStats): LevelGain {
  return {
    delta: diffFittingStats(before, after),
    roleChanges: roleChanges(before, after),
    metrics: gainMetrics(before, after),
  };
}

export interface LevelOption {
  level: number;
  /** A Skill Plan already trains it: shown, but not pickable. */
  planned: boolean;
}

/**
 * The levels a pilot can pick for a skill: every one above what they have
 * (`fromLevel`), those a plan trains `plannedThrough` — a plan trains a skill
 * level by level, so it covers everything up to its highest — flagged.
 */
export function levelOptions(fromLevel: number, plannedThrough: number): LevelOption[] {
  const options: LevelOption[] = [];
  for (let level = fromLevel + 1; level <= 5; level++) {
    options.push({ level, planned: level <= plannedThrough });
  }
  return options;
}

/** The pilot's `picked` level if it is still open, else the first open one; null when none is. */
export function pickedLevel(options: readonly LevelOption[], picked: number | null): number | null {
  const open = options.filter((option) => !option.planned);
  return open.find((option) => option.level === picked)?.level ?? open[0]?.level ?? null;
}

export interface EvaluateSkillGainsOptions {
  /** Awaited before each calculation — hands the main thread back between them. */
  between?: () => Promise<void>;
  /** Checked after each wait; true stops the run, which then resolves null. */
  cancelled?: () => boolean;
}

/**
 * Works out each candidate at its next level (`compare`), one at a time,
 * and keeps those that change at least one tracked stat (`GAIN_METRICS`), in candidate
 * order. A candidate whose calculation throws is left out, not the run.
 */
export async function evaluateSkillGains(
  candidates: readonly SkillGainCandidate[],
  compare: (
    skillTypeId: number,
    level: number
  ) => Promise<{ before: FittingStats; after: FittingStats }>,
  { between, cancelled }: EvaluateSkillGainsOptions = {}
): Promise<SkillGain[] | null> {
  const gains: SkillGain[] = [];
  for (const candidate of candidates) {
    if (between) await between();
    if (cancelled?.()) return null;
    try {
      const { before, after } = await compare(candidate.skillTypeId, candidate.toLevel);
      // Only a change to a stat the pilot ranks by counts: a skill that
      // just moves CPU use or the cargo hold isn't "what to train" for a fit.
      const described = levelGain(before, after);
      if (GAIN_METRICS.every((metric) => described.metrics[metric] === 0)) continue;
      gains.push({ ...candidate, ...described });
    } catch {
      // Left out — see above.
    }
  }
  if (cancelled?.()) return null;
  return gains;
}

/** `gains` ordered by `sort`, largest improvement first, ties by skill id. A new array. */
export function rankSkillGains<T extends SkillGain>(gains: readonly T[], sort: GainSort): T[] {
  return [...gains].sort(
    (a, b) => b.metrics[sort] - a.metrics[sort] || a.skillTypeId - b.skillTypeId
  );
}

export interface SkillGainTrainingTime {
  seconds: number;
  /** The schedule trains other skills first — prerequisites the pilot lacks. */
  includesPrerequisites: boolean;
}

/**
 * The time to train one +1 level from its schedule (`computeSkillPlanSchedule`,
 * which injects any missing prerequisites): the whole schedule, prerequisites
 * included, since the level can't be had without them — flagged so the
 * panel can say so.
 */
export function trainingTimeFor(
  scheduled: readonly { skillTypeID: number; seconds: number }[],
  skillTypeId: number
): SkillGainTrainingTime {
  return {
    seconds: scheduled.reduce((sum, step) => sum + step.seconds, 0),
    includesPrerequisites: scheduled.some((step) => step.skillTypeID !== skillTypeId),
  };
}

/**
 * The skills a schedule trains, each once at the highest level it reaches, in
 * the order they first train — the rows of a card listing what a level needs.
 */
export function scheduledSkillTargets(
  scheduled: readonly { skillTypeID: number; level: number }[]
): PlanEntry[] {
  const targets = new Map<number, number>();
  for (const { skillTypeID, level } of scheduled) {
    targets.set(skillTypeID, Math.max(targets.get(skillTypeID) ?? 0, level));
  }
  return Array.from(targets, ([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }));
}
