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
import { addModule, type ModuleAt } from './fittingEdit';
import { peakAppliedDps } from './implantFinder';
import {
  jobOf,
  reworkGroups,
  scoredJobs,
  TANK_GOALS,
  TANK_GROUPS,
  UNIQUE_GROUPS,
  sideOf,
  type DefenseSide,
  type Job,
} from './improveGroups';
import { applyModuleUpgrade } from './moduleUpgrades';
import {
  overageOf,
  PAIR_LIMIT,
  RESOURCES,
  STAT_TOLERANCE,
  usedOf,
  type Resource,
} from './makeItFit';
import { gainMetrics, type GainMetric } from './skillGains';
import { fitsResourceBudget } from './skillGaps';
import type { TargetProfile } from './targetProfile';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats } from './types';

/** The combat Improve Goals, in the order the drawer shows them. */
export const COMBAT_GOALS = ['overall', 'damage', 'tank', 'speed', 'reach', 'cheaper'] as const;
/** Every Improve Goal: the combat ones, then Mine more. */
export const IMPROVE_GOALS = [...COMBAT_GOALS, 'mining'] as const;
export type ImproveGoal = (typeof IMPROVE_GOALS)[number];

/**
 * A Guardrail an option broke: `budget` the fit no longer fits its CPU,
 * powergrid or calibration; `capStable` a stable capacitor turned unstable;
 * `keepsStats` Cheaper lost more than 5% of damage, tank or speed; `spend`
 * it costs more than the total budget or extra-spend cap allows.
 */
export type Guardrail = 'budget' | 'capStable' | 'keepsStats' | 'spend';

/** How far Improve may go from the fitted modules: Upgrade (default), Rebalance, Rework. */
export const IMPROVE_REACHES = ['upgrade', 'rebalance', 'rework'] as const;
export type ImproveReach = (typeof IMPROVE_REACHES)[number];

/** Planning to buy (default: the fit is a shopping list) or Refitting a ship the pilot owns. */
export const IMPROVE_MODES = ['buy', 'refit'] as const;
export type ImproveMode = (typeof IMPROVE_MODES)[number];

/** Defense Choice: Keep as is, or free the tank modules for Shield or Armor. */
export const DEFENSE_CHOICES = ['keep', 'shield', 'armor'] as const;
export type DefenseChoice = (typeof DEFENSE_CHOICES)[number];

/**
 * Every fitted copy of `fromTypeId` turned into `toTypeId`: one suggestion,
 * not one per copy. A `fromTypeId` of null fills the empty slot in `at`.
 * `pairedWith` is the downgrade that pays for an add no single add fits.
 */
export interface ImproveCandidate {
  fromTypeId: number | null;
  toTypeId: number;
  at: ModuleAt[];
  pairedWith?: ImproveCandidate;
}

/** `fitting` with the candidate (and the downgrade paired with it) made. */
export function applyImproveCandidate(fitting: Fitting, candidate: ImproveCandidate): Fitting {
  const changed =
    candidate.fromTypeId === null
      ? candidate.at.reduce(
          (fit, { slot, slotIndex }) => addModule(fit, slot, slotIndex, candidate.toTypeId),
          fitting
        )
      : applyModuleUpgrade(fitting, { ...candidate, fromTypeId: candidate.fromTypeId });
  return candidate.pairedWith ? applyImproveCandidate(changed, candidate.pairedWith) : changed;
}

export interface ImproveOption {
  candidate: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  /** How much the goal gains: a fraction of the fit's own figure, or ISK saved for Cheaper. */
  score: number;
  /**
   * What the change costs: new minus old when planning to buy; new minus what
   * the removed part sells for when refitting, a changed rig costing the full
   * new one. Null when a price is unknown.
   */
  iskDelta: number | null;
  /** Refitting changes a rig: the old one is destroyed when removed. */
  destroysRigs: boolean;
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
  | { available: true }
  | { available: false; reason: 'noWeapons' | 'noGunsOrLaunchers' | 'noMiners' };

const isArmed = (s: FittingStats) => s.offense.dps > 0 || s.droneDps > 0 || s.fighters.dps > 0;
const hasShipWeapons = (s: FittingStats) =>
  s.applied.weapons.some((w) => w.kind === 'turret' || w.kind === 'missile');

/** Whether the fit can score `goal`, and why not: the drawer shows a disabled chip with the reason. */
export function goalAvailability(goal: ImproveGoal, before: FittingStats): GoalAvailability {
  if (goal === 'damage' && !isArmed(before)) return { available: false, reason: 'noWeapons' };
  if (goal === 'reach' && !hasShipWeapons(before))
    return { available: false, reason: 'noGunsOrLaunchers' };
  // Swaps are module swaps: mining drones alone give nothing to change.
  if (goal === 'mining' && !before.mining.rows.some((row) => !row.isDrone))
    return { available: false, reason: 'noMiners' };
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
    case 'mining':
      return relative(before.mining.perSecond, after.mining.perSecond);
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

/** What the type catalogue says about modules, injected so this module stays pure. */
export interface ModulePool {
  groupOf: (typeId: number) => number | undefined;
  typeIdsInGroup: (groupId: number) => readonly number[];
  /** Whether the item is a market-listed one, not an unpublished or NPC type. */
  published: (typeId: number) => boolean;
  /** Whether the hull takes the module in that rack and the pilot can fly it; absent: assumed. Asked before the per-module cap so unfittable types do not use it. */
  flyable?: (slot: FittingSlotKind, typeId: number) => boolean;
}

export interface CandidateOptions {
  goal: ImproveGoal;
  reach: ImproveReach;
  defense: DefenseChoice;
  /** Rigs are their own group, left out unless ticked. */
  includeRigs: boolean;
  /** Officer and Deadspace modules, left out unless ticked. */
  includeOfficer: boolean;
  /** The hull's slots per rack, to find the empty ones; absent: no fills. */
  slotCounts?: Readonly<Record<FittingSlotKind, number>>;
  /** Absent: only a module's own variations are offered. */
  pool?: ModulePool;
  /** The most candidates returned; the caller that filters afterwards (by hull, skills) lifts it and slices itself. */
  limit?: number;
}

const DEFAULT_OPTIONS: CandidateOptions = {
  goal: 'overall',
  reach: 'upgrade',
  defense: 'keep',
  includeRigs: false,
  includeOfficer: false,
};

/** Targets tried per fitted module type, and fills per rack: the search is whole-fit calculations in a worker. */
export const TARGETS_PER_MODULE = 20;
export const FILLS_PER_RACK = 40;
/** The most candidates one search checks; fits that need more show "Show best so far". */
export const MAX_CANDIDATES = 400;

const FILL_RACKS: readonly FittingSlotKind[] = ['high', 'medium', 'low', 'rig'];

/** The side of the tank the fit already has; null when it has none (or an even split). */
function fittedSide(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined
): DefenseSide | null {
  let shield = 0;
  let armor = 0;
  for (const module of modules) {
    const side = sideOf(groupOf(module.typeId) ?? -1);
    if (side === 'shield') shield++;
    else if (side === 'armor') armor++;
  }
  if (shield === armor) return null;
  return shield > armor ? 'shield' : 'armor';
}

/**
 * The candidates for the fitted modules and the empty slots, each tier in fit
 * order: Upgrade (a module's own variations), Rebalance (the same group),
 * Rework (the goal's groups for the rack, `improveGroups.ts`), and fills.
 * Each fitted module type is one candidate with every copy, so eight 425mm
 * Railgun I offer the IIs as one suggestion. Officer and Deadspace, rigs,
 * a second Damage Control, and removing the last module doing a job the goal
 * does not score are left out.
 */
export function improveCandidates(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  options: Partial<CandidateOptions> = {}
): ImproveCandidate[] {
  const o: CandidateOptions = { ...DEFAULT_OPTIONS, ...options };
  const groupOf = o.pool?.groupOf ?? (() => undefined);
  const side = fittedSide(modules, groupOf);
  const sides: DefenseSide[] =
    o.defense === 'keep' ? (side ? [side] : ['shield', 'armor']) : [o.defense];
  // A chosen side frees the other side's tank modules; nothing else swaps into tank modules.
  const freesTank = o.defense !== 'keep' && TANK_GOALS.has(o.goal);
  const scored: readonly Job[] = scoredJobs(o.goal);

  const jobsFitted = new Map<Job, number>();
  const groupsFitted = new Map<number, number>();
  for (const module of modules) {
    const group = groupOf(module.typeId);
    if (group === undefined) continue;
    groupsFitted.set(group, (groupsFitted.get(group) ?? 0) + 1);
    const job = jobOf(group);
    if (job) jobsFitted.set(job, (jobsFitted.get(job) ?? 0) + 1);
  }

  const copies = new Map<number, ModuleAt[]>();
  for (const module of modules) {
    if (module.slot === 'subsystem' || (module.slot === 'rig' && !o.includeRigs)) continue;
    const at = copies.get(module.typeId);
    const where = { slot: module.slot, slotIndex: module.slotIndex };
    if (at) at.push(where);
    else copies.set(module.typeId, [where]);
  }

  const allowed = (
    typeId: number,
    slot: FittingSlotKind,
    removedGroup: number | undefined,
    removed: number
  ) => {
    if (rackOf[String(typeId)] !== slot) return false;
    if (o.pool && !o.pool.published(typeId)) return false;
    if (o.pool?.flyable && !o.pool.flyable(slot, typeId)) return false;
    if (!o.includeOfficer && EXCLUDED_META_GROUPS.has(index.types[typeId]?.metaGroupId ?? 0))
      return false;
    const group = groupOf(typeId);
    // A second Damage Control (or cloak) is refused by the game.
    if (group !== undefined && UNIQUE_GROUPS.has(group)) {
      const others = (groupsFitted.get(group) ?? 0) - (removedGroup === group ? removed : 0);
      if (others > 0) return false;
    }
    return true;
  };

  const tiers: ImproveCandidate[][] = [[], [], [], []];
  for (const [fromTypeId, at] of copies) {
    const slot = at[0].slot;
    const from = groupOf(fromTypeId);
    const job = jobOf(from);
    const guardsJob = job !== null && !scored.includes(job);
    const seen = new Set<number>([fromTypeId]);
    // Each tier has its own budget, and only an offered target spends it.
    const taken = [0, 0, 0];
    const offer = (tier: number, typeId: number, group: number | undefined) => {
      if (taken[tier] >= TARGETS_PER_MODULE || seen.has(typeId)) return;
      if (!allowed(typeId, slot, from, at.length)) return;
      if (
        freesTank &&
        group !== undefined &&
        TANK_GROUPS.has(group) &&
        !TANK_GROUPS.has(from ?? -1)
      )
        return;
      // Never the last module doing a job nobody scores.
      if (guardsJob && jobOf(group) !== job && (jobsFitted.get(job) ?? 0) - at.length < 1) return;
      seen.add(typeId);
      taken[tier]++;
      tiers[tier].push({ fromTypeId, toTypeId: typeId, at });
    };
    for (const member of getVariations(index, fromTypeId).members) {
      offer(0, member.typeId, groupOf(member.typeId));
    }
    // The other side's tank modules are freed: they take the chosen side's modules whatever the Reach.
    const otherSide = from === undefined ? null : sideOf(from);
    if (o.pool && freesTank && otherSide !== null && otherSide !== o.defense) {
      for (const group of reworkGroups(o.goal, sides))
        if (TANK_GROUPS.has(group))
          for (const typeId of o.pool.typeIdsInGroup(group)) offer(2, typeId, group);
    }
    if (o.pool && from !== undefined && o.reach !== 'upgrade') {
      for (const typeId of o.pool.typeIdsInGroup(from)) offer(1, typeId, from);
    }
    if (o.pool && o.reach === 'rework') {
      for (const group of reworkGroups(o.goal, sides))
        for (const typeId of o.pool.typeIdsInGroup(group)) offer(2, typeId, group);
    }
  }

  // Empty slots are always free to fill: the first one in each rack, from the goal's groups.
  if (o.pool && o.slotCounts) {
    const pool = o.pool;
    for (const slot of FILL_RACKS) {
      if (slot === 'rig' && !o.includeRigs) continue;
      const taken = new Set(modules.filter((m) => m.slot === slot).map((m) => m.slotIndex));
      let free = 0;
      while (free < o.slotCounts[slot] && taken.has(free)) free++;
      if (free >= o.slotCounts[slot]) continue;
      // Each group gets an equal share, so the first groups listed cannot use the whole rack's budget.
      const groups = reworkGroups(o.goal, sides);
      const share = Math.ceil(FILLS_PER_RACK / Math.max(1, groups.length));
      for (const group of groups) {
        let added = 0;
        for (const typeId of pool.typeIdsInGroup(group)) {
          if (added >= share || !allowed(typeId, slot, undefined, 0)) continue;
          added++;
          tiers[3].push({ fromTypeId: null, toTypeId: typeId, at: [{ slot, slotIndex: free }] });
        }
      }
    }
  }
  return tiers.flat().slice(0, o.limit ?? MAX_CANDIDATES);
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

/** Hub sell price of every part, per the mode (`ImproveOption.iskDelta`). */
function iskDeltaOf(
  candidate: ImproveCandidate,
  priceOf: (typeId: number) => number | null,
  mode: ImproveMode
): { isk: number | null; destroysRigs: boolean } {
  const to = priceOf(candidate.toTypeId);
  const from = candidate.fromTypeId === null ? 0 : priceOf(candidate.fromTypeId);
  const isRig = candidate.at[0].slot === 'rig';
  // A removed rig is destroyed, so a refit pays the full new rig and gets nothing back.
  const destroys = mode === 'refit' && isRig && candidate.fromTypeId !== null;
  let isk: number | null =
    to === null || from === null ? null : (to - (destroys ? 0 : from)) * candidate.at.length;
  let destroysRigs = destroys;
  if (candidate.pairedWith) {
    const paired = iskDeltaOf(candidate.pairedWith, priceOf, mode);
    isk = isk === null || paired.isk === null ? null : isk + paired.isk;
    destroysRigs = destroysRigs || paired.destroysRigs;
  }
  return { isk, destroysRigs };
}

/** The best gain among the options, or null when nothing helps: the Defense Choice compares sides by it. */
export function bestScore(result: ImproveResult): number | null {
  const scores = [...result.noDownside, ...result.tradeOffs].map((option) => option.score);
  return scores.length > 0 ? Math.max(...scores) : null;
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
  /** Planning to buy (default) or Refitting a ship the pilot owns. */
  mode?: ImproveMode;
  /** Planning: the total fit price may not pass it. Refitting: the extra spend may not. Null: no limit. */
  spendCap?: number | null;
  /** What the fit costs now, for Planning's total budget. */
  fitTotal?: number | null;
  /** After each candidate: how many are done, of how many. */
  onProgress?: (checked: number, total: number) => void;
  /** Cancel: nothing comes back. */
  isCancelled?: () => boolean;
  /** "Show best so far": stop and rank what is done. */
  shouldStop?: () => boolean;
}

/** Adds that gained on the goal but did not fit the CPU or powergrid, tried with a downgrade. */
const PAIR_SEEDS = 5;

/** Null when cancelled. */
export async function findImprovements({
  fitting,
  before,
  goal,
  candidates,
  stats,
  priceOf,
  target,
  mode = 'buy',
  spendCap = null,
  fitTotal = null,
  onProgress,
  isCancelled,
  shouldStop,
}: FindImprovementsParams): Promise<ImproveResult | null> {
  const kept: ImproveOption[] = [];
  const rejected: RejectedOption[] = [];
  // Every swap's own result, gain or not: a pair's downgrade is one that frees CPU or powergrid.
  const swaps: { candidate: ImproveCandidate; after: FittingStats }[] = [];
  let checked = 0;
  let failed = 0;
  let stopped = false;

  /** Scores one calculated change; false when cancelled mid-way is the caller's concern. */
  function take(candidate: ImproveCandidate, swapped: Fitting, after: FittingStats) {
    const { isk: iskDelta, destroysRigs } = iskDeltaOf(candidate, priceOf, mode);
    const score = scoreOf(goal, before, after, iskDelta, target);
    if (score === null || score <= (goal === 'cheaper' ? 0 : EPSILON)) return;
    const metrics = gainMetrics(before, after);
    const option: ImproveOption = {
      candidate,
      fitting: swapped,
      after,
      score,
      iskDelta,
      destroysRigs,
      downsides: DOWNSIDE_METRICS.filter((metric) => metrics[metric] < -EPSILON),
    };
    const overSpend =
      spendCap !== null &&
      iskDelta !== null &&
      (mode === 'buy' ? (fitTotal ?? 0) + iskDelta : iskDelta) > spendCap;
    const guardrail = brokenGuardrail(goal, before, after, target) ?? (overSpend ? 'spend' : null);
    if (guardrail) rejected.push({ ...option, guardrail });
    else kept.push(option);
  }

  for (const candidate of candidates) {
    if (isCancelled?.()) return null;
    if (shouldStop?.()) {
      stopped = true;
      break;
    }
    const swapped = applyImproveCandidate(fitting, candidate);
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
    if (candidate.fromTypeId !== null) swaps.push({ candidate, after });
    take(candidate, swapped, after);
  }
  // Every calculation failed: the engine is broken, not the fit beyond improving.
  if (checked > 0 && failed === checked) throw new Error('Every Improve calculation failed');

  // Pair moves: an add that gained but did not fit, with a swap that frees what it needs.
  // Estimated from the singles' freed CPU and powergrid, then the best few calculated whole,
  // as Make it fit does (`PAIR_LIMIT`).
  const seeds = rejected
    .filter((option) => option.guardrail === 'budget' && option.candidate.fromTypeId === null)
    .sort((a, b) => b.score - a.score)
    .slice(0, PAIR_SEEDS);
  const pairs: { candidate: ImproveCandidate; estimate: number }[] = [];
  for (const seed of seeds) {
    const over = RESOURCES.filter((r) => overageOf(seed.after, r) > 0);
    for (const swap of swaps) {
      const freed = (r: Resource) => usedOf(before, r) - usedOf(swap.after, r);
      if (!over.every((r) => freed(r) >= overageOf(seed.after, r))) continue;
      pairs.push({
        candidate: { ...seed.candidate, pairedWith: swap.candidate },
        estimate: over.reduce((sum, r) => sum + freed(r), 0),
      });
    }
  }
  pairs.sort((a, b) => b.estimate - a.estimate);
  for (const { candidate } of pairs.slice(0, PAIR_LIMIT)) {
    if (isCancelled?.()) return null;
    if (shouldStop?.()) {
      stopped = true;
      break;
    }
    const swapped = applyImproveCandidate(fitting, candidate);
    try {
      const after = await stats(swapped);
      if (isCancelled?.()) return null;
      if (fitsResourceBudget(after)) take(candidate, swapped, after);
    } catch {
      // Left out, as a single's failure is.
    }
  }

  const ranked = rankImproveOptions(kept);
  return {
    noDownside: ranked.filter((option) => option.downsides.length === 0),
    tradeOffs: ranked.filter((option) => option.downsides.length > 0),
    rejected: [...rejected].sort((a, b) => b.score - a.score).slice(0, REJECTED_LIMIT),
    checked,
    stopped,
  };
}
