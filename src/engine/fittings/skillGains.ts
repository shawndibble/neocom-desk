import type { AttributeWithSources } from './affectedBy';
import type { AppliedWeapon } from './appliedDps';
import { alignTimeSeconds } from './stats';
import type { PlanEntry } from '../types';
import type { FittingStats } from './types';
import { round, statDirection } from './fittingStatFields';
import { budgetOverages } from './skillGaps';
import { diffFittingStats, type FittingStatsDelta } from './variationDelta';

export interface SourcedResult {
  attributes: ReadonlyMap<number, AttributeWithSources>;
  charge?: SourcedResult | undefined;
}

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
  fromLevel: number;
  toLevel: number;
}

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

const COMBAT_METRICS = [
  'dps',
  'ehp',
  'activeTank',
  'speed',
  'align',
  'capacitor',
  'lockRange',
] as const;

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

export const GAIN_METRICS = [...COMBAT_METRICS, ...ROLE_METRICS] as const;
export type GainMetric = (typeof GAIN_METRICS)[number];
export type GainSort = 'overall' | GainMetric;

const OVERALL_WEIGHTS: Partial<Record<GainMetric, number>> = {
  speed: 0.5,
  align: 0.5,
  lockRange: 0.5,
  optimal: 0.5,
  falloff: 0.5,
  tracking: 0.5,
  capacitor: 0.25,
};

export type GainMetrics = Record<GainSort, number>;

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

export const activeTank = (s: FittingStats) => s.repair.shield + s.repair.armor + s.repair.hull;
const alignTime = (s: FittingStats) => alignTimeSeconds(s.navigation.mass, s.navigation.agility);
const isArmed = (s: FittingStats) => s.offense.dps > 0 || s.droneDps > 0;

type ShipWeapon = Extract<AppliedWeapon, { kind: 'turret' | 'missile' }>;
const shipWeapons = (s: FittingStats) =>
  s.applied.weapons.filter((w): w is ShipWeapon => w.kind === 'turret' || w.kind === 'missile');
const turrets = (s: FittingStats) =>
  shipWeapons(s).filter((w): w is Extract<ShipWeapon, { kind: 'turret' }> => w.kind === 'turret');

export interface RoleChange {
  key: RoleMetric;
  before: number;
  after: number;
}

interface RoleField {
  key: RoleMetric;
  digits: number;
  values: (s: FittingStats) => number[];
  applies?: (before: FittingStats) => boolean;
}

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
  },
];

function roleResults(
  before: FittingStats,
  after: FittingStats,
  lossFirst = false
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
      const lowerIsBetter = statDirection(field.key) === 'lower';
      if (b === a || (lowerIsBetter && b === 0)) continue;
      const gain = lowerIsBetter ? -relative(b, a) : relative(b, a);
      const pick =
        best === null ||
        (lossFirst && (gain < 0 || best.gain < 0) ? gain < best.gain : gain > best.gain);
      if (pick) best = { change: { key: field.key, before: b, after: a }, gain };
    }
    if (best) results.push(best);
  }
  return results;
}

export function roleChanges(before: FittingStats, after: FittingStats): RoleChange[] {
  return roleResults(before, after).map(({ change }) => change);
}

export function roleSwapChanges(before: FittingStats, after: FittingStats): RoleChange[] {
  return roleResults(before, after, true).map(({ change }) => change);
}

export function gainMetrics(
  before: FittingStats,
  after: FittingStats,
  weights?: JobOverallWeights
): GainMetrics {
  const metrics = rawMetrics(before, after);
  const weight = overallWeight(before, after, weights);
  const overall = GAIN_METRICS.reduce((sum, metric) => sum + metrics[metric] * weight(metric), 0);
  return { overall, ...metrics };
}

export function improveOverall(
  before: FittingStats,
  after: FittingStats,
  weights?: JobOverallWeights
): number {
  const { overall, activeTank: repair } = gainMetrics(before, after, weights);
  const sustained = relative(before.tank.sustainedEffective, after.tank.sustainedEffective);
  return overall + (sustained - repair) * overallWeight(before, after, weights)('activeTank');
}

function rawMetrics(before: FittingStats, after: FittingStats): Record<GainMetric, number> {
  const roleGains = Object.fromEntries([
    ...ROLE_METRICS.map((key): [RoleMetric, number] => [key, 0]),
    ...roleResults(before, after).map(({ change, gain }) => [change.key, gain]),
  ]) as Record<RoleMetric, number>;
  return {
    dps: relative(before.offense.dps, after.offense.dps),
    ehp: relative(before.ehp, after.ehp),
    activeTank: relative(activeTank(before), activeTank(after)),
    speed: relative(before.navigation.maxVelocity, after.navigation.maxVelocity),
    align: -relative(alignTime(before), alignTime(after)),
    capacitor: capacitorGain(before.capacitor, after.capacitor),
    lockRange: relative(before.targeting.maxTargetRange, after.targeting.maxTargetRange),
    ...roleGains,
  };
}

export type JobOverallWeights = Partial<Record<GainMetric, number>>;

function overallWeight(before: FittingStats, after: FittingStats, jobWeights?: JobOverallWeights) {
  const flipped = before.capacitor.stable !== after.capacitor.stable;
  return (metric: GainMetric) => {
    if (metric === 'capacitor' && flipped) return 1;
    if (jobWeights) return jobWeights[metric] ?? 1;
    return !isArmed(before) ? 1 : (OVERALL_WEIGHTS[metric] ?? 1);
  };
}

export function overallTerms(
  before: FittingStats,
  after: FittingStats
): { metric: GainMetric; term: number }[] {
  const metrics = rawMetrics(before, after);
  const weight = overallWeight(before, after);
  return GAIN_METRICS.map((metric) => ({ metric, term: metrics[metric] * weight(metric) }))
    .filter(({ term }) => term > 0)
    .sort((a, b) => b.term - a.term);
}

export interface SkillGain extends SkillGainCandidate {
  delta: FittingStatsDelta;
  roleChanges: RoleChange[];
  metrics: GainMetrics;
  budgetFreed?: number;
}

export function budgetFreed(before: FittingStats, after: FittingStats): number {
  const was = budgetOverages(before);
  const now = budgetOverages(after);
  if (now.some((overage, i) => overage > was[i]!)) return 0;
  return was.reduce((sum, w, i) => (w > 0 ? sum + (w - now[i]!) / w : sum), 0);
}

export type LevelGain = Pick<SkillGain, 'delta' | 'roleChanges' | 'metrics'>;

export function levelGain(before: FittingStats, after: FittingStats): LevelGain {
  return {
    delta: diffFittingStats(before, after),
    roleChanges: roleChanges(before, after),
    metrics: gainMetrics(before, after),
  };
}

export interface LevelOption {
  level: number;
  planned: boolean;
}

export function levelOptions(fromLevel: number, plannedThrough: number): LevelOption[] {
  const options: LevelOption[] = [];
  for (let level = fromLevel + 1; level <= 5; level++) {
    options.push({ level, planned: level <= plannedThrough });
  }
  return options;
}

export function pickedLevel(options: readonly LevelOption[], picked: number | null): number | null {
  const open = options.filter((option) => !option.planned);
  return open.find((option) => option.level === picked)?.level ?? open[0]?.level ?? null;
}

export interface EvaluateSkillGainsOptions {
  between?: () => Promise<void>;
  cancelled?: () => boolean;
}

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
      const described = levelGain(before, after);
      const freed = budgetFreed(before, after);
      if (freed <= 0 && GAIN_METRICS.every((metric) => described.metrics[metric] === 0)) continue;
      gains.push({ ...candidate, ...described, ...(freed > 0 ? { budgetFreed: freed } : {}) });
    } catch {}
  }
  if (cancelled?.()) return null;
  return gains;
}

export function rankSkillGains<T extends SkillGain>(gains: readonly T[], sort: GainSort): T[] {
  return [...gains].sort(
    (a, b) =>
      (b.budgetFreed ?? 0) - (a.budgetFreed ?? 0) ||
      b.metrics[sort] - a.metrics[sort] ||
      a.skillTypeId - b.skillTypeId
  );
}

export interface SkillGainTrainingTime {
  seconds: number;
  includesPrerequisites: boolean;
}

export function trainingTimeFor(
  scheduled: readonly { skillTypeID: number; seconds: number }[],
  skillTypeId: number
): SkillGainTrainingTime {
  return {
    seconds: scheduled.reduce((sum, step) => sum + step.seconds, 0),
    includesPrerequisites: scheduled.some((step) => step.skillTypeID !== skillTypeId),
  };
}

export function scheduledSkillTargets(
  scheduled: readonly { skillTypeID: number; level: number }[]
): PlanEntry[] {
  const targets = new Map<number, number>();
  for (const { skillTypeID, level } of scheduled) {
    targets.set(skillTypeID, Math.max(targets.get(skillTypeID) ?? 0, level));
  }
  return Array.from(targets, ([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }));
}
