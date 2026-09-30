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

/** The stats a pilot ranks by; `primary` is all of them together. */
export const GAIN_METRICS = [
  'dps',
  'ehp',
  'activeTank',
  'speed',
  'align',
  'capacitor',
  'lockRange',
] as const;
export type GainMetric = (typeof GAIN_METRICS)[number];
export type GainSort = 'primary' | GainMetric;

/** Each metric's improvement (positive: better), plus `primary`, their sum. */
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

/**
 * How much better `after` is than `before` in each tracked stat, as a
 * fraction of `before` — so a DPS gain and an EHP gain add up on one scale.
 * Align time is better lower; the capacitor is scored in stable-% points,
 * or relative depletion time, with turning stable a whole gain.
 */
export function gainMetrics(before: FittingStats, after: FittingStats): GainMetrics {
  const metrics: Record<GainMetric, number> = {
    dps: relative(before.offense.dps, after.offense.dps),
    ehp: relative(before.ehp, after.ehp),
    activeTank: relative(activeTank(before), activeTank(after)),
    speed: relative(before.navigation.maxVelocity, after.navigation.maxVelocity),
    align: -relative(alignTime(before), alignTime(after)),
    capacitor: capacitorGain(before.capacitor, after.capacitor),
    lockRange: relative(before.targeting.maxTargetRange, after.targeting.maxTargetRange),
  };
  const primary = GAIN_METRICS.reduce((sum, metric) => sum + metrics[metric], 0);
  return { primary, ...metrics };
}

export interface SkillGain extends SkillGainCandidate {
  /** Every displayed stat the +1 level changes, as the Variations table words them. */
  delta: FittingStatsDelta;
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
 * and keeps those that change at least one displayed stat, in candidate
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
      const delta = diffFittingStats(before, after);
      if (delta.count === 0) continue;
      gains.push({ ...candidate, delta, metrics: gainMetrics(before, after) });
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
