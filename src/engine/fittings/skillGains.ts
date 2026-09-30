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
import { alignTimeSeconds } from './stats';
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
 * What a miner, hauler, logistics or jump pilot ranks by. Each is zero on a
 * fit with no such role — no miners, a fit that shoots, no remote repairers,
 * no jump drive — so a combat fit's list never grows a cargo or mining row.
 */
export const ROLE_METRICS = [
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

/** Each metric's improvement (positive: better), plus `overall`, their sum. */
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
 * or relative depletion time, with turning stable a whole gain.
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
  const overall = GAIN_METRICS.reduce((sum, metric) => sum + metrics[metric], 0);
  return { overall, ...metrics };
}

export interface SkillGain extends SkillGainCandidate {
  /** Every displayed stat the +1 level changes, as the Variations table words them. */
  delta: FittingStatsDelta;
  /** Mining, hold, remote-repair and jump-range changes, which `delta` leaves out. */
  roleChanges: RoleChange[];
  metrics: GainMetrics;
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
      const metrics = gainMetrics(before, after);
      if (GAIN_METRICS.every((metric) => metrics[metric] === 0)) continue;
      gains.push({
        ...candidate,
        delta: diffFittingStats(before, after),
        roleChanges: roleChanges(before, after),
        metrics,
      });
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
