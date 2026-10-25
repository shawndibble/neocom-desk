/**
 * Improve: a search the pilot points at an Improve Goal (scope decision
 * `20261024-171917`). Each candidate turns every fitted copy of one module
 * into a variation of itself, is recalculated whole through the injected
 * `stats` — under the page's own Damage Profile, Target Profile, Overheat all
 * and implant basis, so a row's numbers are what the pilot sees after Apply —
 * scored against the goal and checked against its Guardrails. The loop is
 * Make it fit's (`findFitSwaps`); the goals and guardrails are this module's.
 * Pure.
 */
import type { VariationIndex } from '../market/variations';
import { getVariations } from '../market/variations';
import type { ModuleAt } from './fittingEdit';
import { peakAppliedDps } from './implantFinder';
import { applyModuleUpgrade, type ModuleUpgrade } from './moduleUpgrades';
import { STAT_TOLERANCE } from './makeItFit';
import { gainMetrics, type GainMetric } from './skillGains';
import { fitsResourceBudget } from './skillGaps';
import type { TargetProfile } from './targetProfile';
import type { Fitting, FittingModule, FittingStats } from './types';

/** The combat Improve Goals, in the order the drawer shows them. */
export const COMBAT_GOALS = ['overall', 'damage', 'tank', 'speed', 'reach', 'cheaper'] as const;
export type ImproveGoal = (typeof COMBAT_GOALS)[number];

/**
 * A Guardrail an option broke: `budget` the fit no longer fits its CPU,
 * powergrid or calibration; `capStable` a stable capacitor turned unstable;
 * `keepsStats` Cheaper lost more than 5% of damage, tank or speed.
 */
export type Guardrail = 'budget' | 'capStable' | 'keepsStats';

/** Every fitted copy of `fromTypeId` turned into `toTypeId`: one suggestion, not one per copy. */
export type ImproveCandidate = ModuleUpgrade;

export interface ImproveOption {
  candidate: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  /** How much the goal gains: a fraction of the fit's own figure, or ISK saved for Cheaper. */
  score: number;
  /** What the swap costs net of the modules it replaces; null when either price is unknown. */
  iskDelta: number | null;
  /** The stats it worsens; empty is No downside. */
  downsides: GainMetric[];
}

export interface RejectedOption extends ImproveOption {
  guardrail: Guardrail;
}

export interface ImproveResult {
  /** Gains on the goal and worsens no stat. */
  noDownside: ImproveOption[];
  /** Gains on the goal and names what it gives up. */
  tradeOffs: ImproveOption[];
  /** The closest swaps that gained on the goal but broke a Guardrail, best first. */
  rejected: RejectedOption[];
  /** How many candidates were calculated. */
  checked: number;
  /** The pilot asked for the best so far before every candidate was checked. */
  stopped: boolean;
}

/** How many rejected swaps the empty view lists. */
export const REJECTED_LIMIT = 5;

/** Officer and Deadspace: never offered unless the pilot asks (a later ticket adds the tick). */
const EXCLUDED_META_GROUPS: ReadonlySet<number> = new Set([5, 6]);

/** A change smaller than this (a fraction) is rounding, not a gain or a loss. */
const EPSILON = 1e-4;

/** The stats a swap can give up, as What to train scores them. */
const DOWNSIDE_METRICS: readonly GainMetric[] = [
  'dps',
  'ehp',
  'activeTank',
  'speed',
  'align',
  'capacitor',
  'lockRange',
  'optimal',
  'falloff',
  'tracking',
];

export type GoalAvailability =
  { available: true } | { available: false; reason: 'noWeapons' | 'noGunsOrLaunchers' };

const isArmed = (s: FittingStats) => s.offense.dps > 0 || s.droneDps > 0 || s.fighters.dps > 0;
const hasShipWeapons = (s: FittingStats) =>
  s.applied.weapons.some((w) => w.kind === 'turret' || w.kind === 'missile');

/** Whether the fit can score `goal`, and why not: the drawer shows a disabled chip with the reason. */
export function goalAvailability(goal: ImproveGoal, before: FittingStats): GoalAvailability {
  if (goal === 'damage' && !isArmed(before)) return { available: false, reason: 'noWeapons' };
  if (goal === 'reach' && !hasShipWeapons(before))
    return { available: false, reason: 'noGunsOrLaunchers' };
  return { available: true };
}

/**
 * Sustained applied DPS against the Target Profile (fighters included), or
 * the listed sustained DPS of guns, drones and fighters when there is no
 * profile or no firing weapon to apply.
 */
function damageOf(s: FittingStats, target: TargetProfile | undefined): number {
  if (target && s.applied.weapons.length > 0) return peakAppliedDps(s, target);
  return s.offense.sustainedDps + s.droneDps + s.fighters.dps;
}

function relative(before: number, after: number): number {
  if (before === after) return 0;
  if (before === 0) return after > 0 ? 1 : -1;
  return (after - before) / Math.abs(before);
}

function scoreOf(
  goal: ImproveGoal,
  before: FittingStats,
  after: FittingStats,
  iskDelta: number | null,
  target: TargetProfile | undefined
): number | null {
  const metrics = gainMetrics(before, after);
  switch (goal) {
    case 'overall':
      return metrics.overall;
    case 'damage':
      return relative(damageOf(before, target), damageOf(after, target));
    case 'tank':
      return metrics.ehp;
    case 'speed':
      return metrics.speed;
    case 'reach':
      return metrics.optimal + metrics.falloff;
    case 'cheaper':
      return iskDelta === null ? null : -iskDelta;
  }
}

/** The first Guardrail `after` breaks, or null. */
function brokenGuardrail(
  goal: ImproveGoal,
  before: FittingStats,
  after: FittingStats,
  target: TargetProfile | undefined
): Guardrail | null {
  if (fitsResourceBudget(before) && !fitsResourceBudget(after)) return 'budget';
  if (before.capacitor.stable && !after.capacitor.stable) return 'capStable';
  if (goal === 'cheaper') {
    const kept: [number, number][] = [
      [damageOf(before, target), damageOf(after, target)],
      [before.ehp, after.ehp],
      [before.navigation.maxVelocity, after.navigation.maxVelocity],
    ];
    if (kept.some(([b, a]) => b > 0 && (b - a) / b > STAT_TOLERANCE)) return 'keepsStats';
  }
  return null;
}

/**
 * Each fitted module type's variations for the same rack, once per type with
 * every fitted copy, in fit order: eight 425mm Railgun I offer the IIs as one
 * suggestion. Officer and Deadspace variations are left out.
 */
export function improveCandidates(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>
): ImproveCandidate[] {
  const copies = new Map<number, ModuleAt[]>();
  for (const module of modules) {
    if (module.slot === 'subsystem') continue;
    const at = copies.get(module.typeId);
    const where = { slot: module.slot, slotIndex: module.slotIndex };
    if (at) at.push(where);
    else copies.set(module.typeId, [where]);
  }
  const candidates: ImproveCandidate[] = [];
  for (const [fromTypeId, at] of copies) {
    const slot = at[0].slot;
    for (const member of getVariations(index, fromTypeId).members) {
      if (member.typeId === fromTypeId) continue;
      if (EXCLUDED_META_GROUPS.has(member.metaGroupId)) continue;
      if (rackOf[String(member.typeId)] !== slot) continue;
      candidates.push({ fromTypeId, toTypeId: member.typeId, at });
    }
  }
  return candidates;
}

/** Best score first; a tie goes to the cheaper swap; an unpriced swap sorts after every priced one. */
export function rankImproveOptions<T extends ImproveOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => {
    const ap = a.iskDelta === null;
    const bp = b.iskDelta === null;
    if (ap !== bp) return ap ? 1 : -1;
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
  });
}

export interface FindImprovementsParams {
  fitting: Fitting;
  /** The open Fitting's own stats, under the same conditions as `stats`. */
  before: FittingStats;
  goal: ImproveGoal;
  candidates: readonly ImproveCandidate[];
  /** Whole-fit stats under the pilot, implants and conditions the page shows. */
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  /** The page's Target Profile, for More damage's applied DPS. */
  target?: TargetProfile;
  /** After each candidate: how many are done, of how many. */
  onProgress?: (checked: number, total: number) => void;
  /** Cancel: nothing comes back. */
  isCancelled?: () => boolean;
  /** "Show best so far": stop and rank what is done. */
  shouldStop?: () => boolean;
}

function iskDeltaOf(
  candidate: ImproveCandidate,
  priceOf: (typeId: number) => number | null
): number | null {
  const to = priceOf(candidate.toTypeId);
  const from = priceOf(candidate.fromTypeId);
  if (to === null || from === null) return null;
  return (to - from) * candidate.at.length;
}

/** Null when cancelled. */
export async function findImprovements({
  fitting,
  before,
  goal,
  candidates,
  stats,
  priceOf,
  target,
  onProgress,
  isCancelled,
  shouldStop,
}: FindImprovementsParams): Promise<ImproveResult | null> {
  const kept: ImproveOption[] = [];
  const rejected: RejectedOption[] = [];
  let checked = 0;
  let failed = 0;
  let stopped = false;
  for (const candidate of candidates) {
    if (isCancelled?.()) return null;
    if (shouldStop?.()) {
      stopped = true;
      break;
    }
    const swapped = applyModuleUpgrade(fitting, candidate);
    let after: FittingStats | null = null;
    try {
      after = await stats(swapped);
    } catch {
      // Left out: one variation's calculation failing must not end the search.
      failed++;
    }
    if (isCancelled?.()) return null;
    checked++;
    onProgress?.(checked, candidates.length);
    if (after === null) continue;
    const iskDelta = iskDeltaOf(candidate, priceOf);
    const score = scoreOf(goal, before, after, iskDelta, target);
    if (score === null || score <= (goal === 'cheaper' ? 0 : EPSILON)) continue;
    const metrics = gainMetrics(before, after);
    const option: ImproveOption = {
      candidate,
      fitting: swapped,
      after,
      score,
      iskDelta,
      downsides: DOWNSIDE_METRICS.filter((metric) => metrics[metric] < -EPSILON),
    };
    const guardrail = brokenGuardrail(goal, before, after, target);
    if (guardrail) rejected.push({ ...option, guardrail });
    else kept.push(option);
  }
  // Every calculation failed: the engine is broken, not the fit beyond improving.
  if (checked > 0 && failed === checked) throw new Error('Every Improve calculation failed');
  const ranked = rankImproveOptions(kept);
  return {
    noDownside: ranked.filter((option) => option.downsides.length === 0),
    tradeOffs: ranked.filter((option) => option.downsides.length > 0),
    rejected: [...rejected].sort((a, b) => b.score - a.score).slice(0, REJECTED_LIMIT),
    checked,
    stopped,
  };
}
