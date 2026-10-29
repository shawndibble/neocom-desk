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
import { addModule, removeModule, type ModuleAt } from './fittingEdit';
import { peakAppliedDps } from './implantFinder';
import type { ExploreStats } from './explore';
import {
  EXPLORE_RIG_GROUPS,
  jobOf,
  reworkGroups,
  RESOURCE_RIG_GROUPS,
  TANK_GOALS,
  TANK_GROUPS,
  UNIQUE_GROUPS,
  sideOf,
  type DefenseSide,
  type Job,
} from './improveGroups';
import {
  dropLimitsOf,
  firstLimitBreach,
  HELD_EVERY_COPY,
  holdsTankModules,
  overallWeightsOf,
  swapLimitsOf,
  unguardedJobs,
  type ExploreSpace,
  type ImproveJob,
  type LimitStat,
} from './improveJob';
import { newRuleBreaks } from './ruleBreaks';
import { applyModuleUpgrade } from './moduleUpgrades';
import {
  findFitSwaps,
  overageOf,
  PAIR_LIMIT,
  RESOURCES,
  usedOf,
  type FitSwap,
  type Resource,
} from './makeItFit';
import { commandGain, commandOf, hasCommand } from './improveCommand';
import { hullRoleOf, roleUnlocks, type HullRef } from './improveRole';
import { ewarOf, tackleOf } from './improveTackle';
import { changeVerdict } from './fittingStatFields';
import { gainMetrics, improveOverall, roleChanges, type RoleChange } from './skillGains';
import { fitsResourceBudget } from './skillGaps';
import type { TargetProfile } from './targetProfile';
import { diffFittingStats, type StatChange } from './variationDelta';
import { alignTimeSeconds } from './stats';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats, HoldStats } from './types';

/** The combat Improve Goals, in the order the drawer shows them. */
export const COMBAT_GOALS = ['overall', 'damage', 'tank', 'speed', 'reach', 'cheaper'] as const;
/** Every Improve Goal: the combat ones, Mine more, the hauling and movement ones, the logistics ones, then tackle and EWAR, command and fleet, then Explore better. */
export const IMPROVE_GOALS = [
  ...COMBAT_GOALS,
  'mining',
  'haul',
  'align',
  'warp',
  'repair',
  'transfer',
  'tackle',
  'ewar',
  'command',
  'explore',
] as const;
export type ImproveGoal = (typeof IMPROVE_GOALS)[number];

/** The holds Carry more can score, as `HoldStats` fields: the pilot picks one. */
export const IMPROVE_HOLDS = [
  'cargo',
  'fleetHangar',
  'miningHold',
  'ammoHold',
  'planetaryHold',
  'commandCenterHold',
  'mineralHold',
  'gasHold',
  'iceHold',
  'fuelBay',
  'infrastructureHold',
] as const satisfies readonly (keyof HoldStats)[];
export type ImproveHold = (typeof IMPROVE_HOLDS)[number];

/** The hold Carry more scores when the pilot has not picked one the hull has. */
export const DEFAULT_IMPROVE_HOLD: ImproveHold = 'cargo';

/** The hold Carry more scores on this hull: `preferred` if it has it, else the first it has, else `preferred`. */
export const effectiveHold = (holds: HoldStats, preferred: ImproveHold): ImproveHold =>
  heldHold(holds, preferred) ?? preferred;

/** The first hold in `IMPROVE_HOLDS` order the hull has, for a pick this hull lacks; null with none. */
export function heldHold(holds: HoldStats, preferred: ImproveHold): ImproveHold | null {
  if (holds[preferred] > 0) return preferred;
  return IMPROVE_HOLDS.find((hold) => holds[hold] > 0) ?? null;
}

/**
 * A Guardrail an option broke: `budget` the fit no longer fits its CPU,
 * powergrid or calibration; `capStable` a stable capacitor turned unstable;
 * `keepsTank` a tank conversion lost more than half of the sustained tank, or
 * a job's tank limit broke (Explore Dangerous, every swap);
 * `keepsStats` Cheaper, or a job's drop limit, lost too much of damage, tank or speed; `spend`
 * it costs more than the total budget or extra-spend cap allows.
 */
export type Guardrail = 'budget' | 'capStable' | 'keepsTank' | 'keepsStats' | 'spend';

/** A conversion must keep at least this share of the sustained tank. */
const CONVERSION_KEEPS_SUSTAINED = 0.5;

/** How far Improve may go from the fitted modules: Upgrade (default), Rebalance, Rework. */
export const IMPROVE_REACHES = ['upgrade', 'rebalance', 'rework'] as const;
export type ImproveReach = (typeof IMPROVE_REACHES)[number];

/** Defense Choice: Keep as is, or free the tank modules for Shield or Armor. */
export const DEFENSE_CHOICES = ['keep', 'shield', 'armor'] as const;
export type DefenseChoice = (typeof DEFENSE_CHOICES)[number];

/** The racks a tank module sits in (rigs are never part of a conversion). */
export const TANK_RACKS = ['high', 'medium', 'low'] as const;
export type TankRack = (typeof TANK_RACKS)[number];

/**
 * A whole-tank conversion, carried by the first link of its chain: the other
 * side's tank modules (and any displaced from a full rack) are removed before
 * the chain's adds are made. `freed` counts, per rack, the emptied slots the
 * adds did not refill.
 */
export interface TankConversion {
  side: DefenseSide;
  removes: { typeId: number; at: ModuleAt[] }[];
  freed: Record<TankRack, number>;
}

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
  /** Replaces a fitted module the pilot cannot fly yet: accepted even when it scores worse on the goal. */
  fixesUnflyable?: boolean;
  /** What the swaps chained behind a fix put right: the fit's budget, or its capacitor. */
  covers?: 'budget' | 'capacitor';
  /** Swaps a CPU or powergrid rig away (Explore better): offered only while the fit still fits without it. */
  dropsResourceRig?: boolean;
  /** Strips the other side's tank first; the candidate and its `pairedWith` chain then fill the chosen side's rack. */
  conversion?: TankConversion;
}

/** `fitting` with the candidate (and the downgrade paired with it) made. */
export function applyImproveCandidate(fitting: Fitting, candidate: ImproveCandidate): Fitting {
  const start = candidate.conversion
    ? candidate.conversion.removes
        .flatMap(({ at }) => at)
        .reduce((fit, { slot, slotIndex }) => removeModule(fit, slot, slotIndex), fitting)
    : fitting;
  const changed =
    candidate.fromTypeId === null
      ? candidate.at.reduce(
          (fit, { slot, slotIndex }) => addModule(fit, slot, slotIndex, candidate.toTypeId),
          start
        )
      : applyModuleUpgrade(start, { ...candidate, fromTypeId: candidate.fromTypeId });
  return candidate.pairedWith ? applyImproveCandidate(changed, candidate.pairedWith) : changed;
}

export interface ImproveOption {
  candidate: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  /** How much the goal gains: a fraction of the fit's own figure, or ISK saved for Cheaper. */
  score: number;
  /**
   * What the change costs: new minus old. Null when a price is unknown.
   */
  iskDelta: number | null;
  /** Every stat it makes worse, before and after, so "Gives up" names the size; empty is No downside. */
  lost: LostStat[];
}

/** A stat a swap makes worse: a stats-panel change, or a weapon-reach and mining one. */
export type LostStat = { kind: 'stat'; change: StatChange } | { kind: 'role'; change: RoleChange };

/** A fit this full of CPU, powergrid or calibration has no room left, so using more is a cost. */
const TIGHT_BUDGET = 0.9;

const BUDGET_USED = {
  cpuUsed: 'cpuTotal',
  powergridUsed: 'powergridTotal',
  calibrationUsed: 'calibrationTotal',
} as const;

/** Role stats a swap is told it gives up, whatever the goal. */
const LOST_ROLE_KEYS: ReadonlySet<string> = new Set([
  'optimal',
  'falloff',
  'tracking',
  'miningYield',
]);

/**
 * Every shown stat the swap makes worse. Fitting resources count only when the
 * fit ends within `TIGHT_BUDGET` of its budget.
 */
export function lostStats(before: FittingStats, after: FittingStats): LostStat[] {
  const shown = diffFittingStats(before, after).changes.filter((change) => {
    if (changeVerdict(change) !== 'worse') return false;
    const total = BUDGET_USED[change.key as keyof typeof BUDGET_USED];
    return total === undefined || (after[total] > 0 && change.after > after[total] * TIGHT_BUDGET);
  });
  const roles = roleChanges(before, after).filter(
    (change) => LOST_ROLE_KEYS.has(change.key) && changeVerdict(change) === 'worse'
  );
  return [
    ...shown.map((change): LostStat => ({ kind: 'stat', change })),
    ...roles.map((change): LostStat => ({ kind: 'role', change })),
  ];
}

export interface RejectedOption extends ImproveOption {
  guardrail: Guardrail;
}

export interface ImproveResult {
  /**
   * Replacements for fitted modules the pilot cannot fly, each one applicable:
   * a fix that overran CPU, powergrid or calibration carries the swaps that
   * bring the fit back under (`pairedWith`), fewest changes first.
   */
  makeFlyable: ImproveOption[];
  /**
   * The fixes that overran CPU, powergrid or calibration on their own, covered or
   * not: what an implant could also pay for, shown beside the swaps that do.
   */
  flyableOverrun: RejectedOption[];
  /** Fixes no swap could make applicable, or that cost more than the budget: shown greyed with why. */
  flyableBlocked: RejectedOption[];
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
export const EPSILON = 1e-4;

export type GoalAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | 'noWeapons'
        | 'noGunsOrLaunchers'
        | 'noMiners'
        | 'noHold'
        | 'noAlign'
        | 'noWarp'
        | 'noRemoteRepair'
        | 'noCapTransfer'
        | 'noTackle'
        | 'noEwar'
        | 'noCommand'
        | 'noExplore';
    };

const isArmed = (s: FittingStats) => s.offense.dps > 0 || s.droneDps > 0 || s.fighters.dps > 0;
/** Shield, armor and hull HP/s the fit hands to other ships, on one scale. */
export const remoteRepairOf = (s: FittingStats) => {
  const { shield, armor, hull } = s.support.remoteRepair;
  return shield + armor + hull;
};
const canAlign = (s: FittingStats) => alignTimeSeconds(s.navigation.mass, s.navigation.agility) > 0;
/** Fitted guns and launchers, loaded or not: an empty one is the unloaded-weapons notice's to explain. */
const hasShipWeapons = (s: FittingStats) =>
  s.offense.chargelessWeaponCount > 0 ||
  s.applied.weapons.some((w) => w.kind === 'turret' || w.kind === 'missile' || w.kind === 'area');

/** Whether the fit can score `goal`, and why not: the drawer shows a disabled chip with the reason. */
export function goalAvailability(
  goal: ImproveGoal,
  before: FittingStats,
  hull?: HullRef
): GoalAvailability {
  // A hull built for the job offers the goal on an empty fit: its search is fills of the goal's groups.
  if (roleUnlocks(hullRoleOf(hull)).includes(goal)) return { available: true };
  if (goal === 'damage' && !isArmed(before)) return { available: false, reason: 'noWeapons' };
  if (goal === 'reach' && !hasShipWeapons(before))
    return { available: false, reason: 'noGunsOrLaunchers' };
  // Swaps are module swaps: mining drones alone give nothing to change.
  if (goal === 'mining' && !before.mining.rows.some((row) => !row.isDrone))
    return { available: false, reason: 'noMiners' };
  if (goal === 'haul' && heldHold(before.holds, DEFAULT_IMPROVE_HOLD) === null)
    return { available: false, reason: 'noHold' };
  if (goal === 'align' && !canAlign(before)) return { available: false, reason: 'noAlign' };
  if (goal === 'warp' && !(canAlign(before) && before.navigation.warpSpeed > 0))
    return { available: false, reason: 'noWarp' };
  if (goal === 'repair' && remoteRepairOf(before) <= 0)
    return { available: false, reason: 'noRemoteRepair' };
  if (goal === 'transfer' && before.support.capTransfer <= 0)
    return { available: false, reason: 'noCapTransfer' };
  if (goal === 'tackle') {
    const { points, web } = tackleOf(before);
    if (points <= 0 && web <= 0) return { available: false, reason: 'noTackle' };
  }
  if (goal === 'ewar' && ewarOf(before).strength <= 0)
    return { available: false, reason: 'noEwar' };
  if (goal === 'command' && !hasCommand(before)) return { available: false, reason: 'noCommand' };
  if (goal === 'explore' && before.explore.modules <= 0)
    return { available: false, reason: 'noExplore' };
  return { available: true };
}

/**
 * Sustained applied DPS against the Target Profile (reload included, fighters
 * included), or the fit's listed sustained DPS when there is no profile or no
 * firing weapon to apply. `offense` already holds a row for every drone and
 * fighter, so nothing is added to it.
 */
export function damageOf(s: FittingStats, target: TargetProfile | undefined): number {
  if (target && s.applied.weapons.length > 0) return peakAppliedDps(s, target);
  return s.offense.sustainedDps;
}

function relative(before: number, after: number): number {
  if (before === after) return 0;
  if (before === 0) return after > 0 ? 1 : -1;
  return (after - before) / Math.abs(before);
}

/** The relative change, or the absolute one in the goal's unit when the fit starts from nothing (a fill from zero has no ratio). */
function gainOrAbsolute(before: number, after: number): number {
  return before === 0 ? after - before : relative(before, after);
}

/** The mean relative gain over the figures the fit already has; a figure it lost counts -1. */
function meanGain(pairs: readonly (readonly [number, number])[]): number {
  const present = pairs.filter(([before]) => before > 0);
  if (present.length === 0) return 0;
  return (
    present.reduce((sum, [before, after]) => sum + relative(before, after), 0) / present.length
  );
}

/** Cycles a second of an analyzer; 0 with no cycle. */
const cycleRate = (seconds: number): number => (seconds > 0 ? 1 / seconds : 0);

/**
 * Explore's hacking and scanning families the fit has, each one's gain.
 * Hacking adds up, over the fit's analyzers (paired by position; one the swap
 * drops loses all three of its figures), the gains in strength, coherence and
 * cycles a second: a rig lifts one figure of one analyzer, and averaging that
 * with the figures it leaves alone would bury it under a speed rig. Scanning
 * is the mean of the scan figures present.
 */
function exploreFamilyGains(before: ExploreStats, after: ExploreStats): number[] {
  const families: number[] = [];
  if (before.analyzers.length > 0) {
    const gains = before.analyzers.flatMap((was, i) => {
      const now = after.analyzers[i] ?? { strength: 0, coherence: 0, cycleSeconds: 0 };
      return [
        [was.strength, now.strength],
        [was.coherence, now.coherence],
        [cycleRate(was.cycleSeconds), cycleRate(now.cycleSeconds)],
      ].flatMap(([figure, next]) => (figure! > 0 ? [relative(figure!, next!)] : []));
    });
    families.push(gains.reduce((sum, gain) => sum + gain, 0));
  }
  const [was, now] = [before.scanning, after.scanning];
  if (was.strength > 0 || was.duration > 0 || was.deviation > 0)
    families.push(
      meanGain([
        [was.strength, now.strength],
        [was.duration, now.duration],
        [was.deviation, now.deviation],
      ])
    );
  return families;
}

export function scoreOf(
  goal: ImproveGoal,
  before: FittingStats,
  after: FittingStats,
  iskDelta: number | null,
  target: TargetProfile | undefined,
  hold: ImproveHold,
  job?: ImproveJob
): number | null {
  const metrics = gainMetrics(before, after);
  switch (goal) {
    case 'overall':
      return improveOverall(before, after, job && overallWeightsOf(job));
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
      return gainOrAbsolute(before.mining.perSecond, after.mining.perSecond);
    case 'haul':
      return gainOrAbsolute(before.holds[hold], after.holds[hold]);
    case 'align':
      return metrics.align;
    case 'warp':
      return metrics.align + relative(before.navigation.warpSpeed, after.navigation.warpSpeed);
    case 'repair':
      return gainOrAbsolute(remoteRepairOf(before), remoteRepairOf(after));
    case 'transfer':
      return gainOrAbsolute(before.support.capTransfer, after.support.capTransfer);
    case 'tackle': {
      const [was, now] = [tackleOf(before), tackleOf(after)];
      return meanGain([
        [was.points, now.points],
        [was.web, now.web],
        [was.range, now.range],
      ]);
    }
    case 'explore': {
      // The mean of the families the fit has (hacking, scanning, mobility), each gained on its own so one strength rig is not diluted by the rest.
      const families = exploreFamilyGains(before.explore, after.explore);
      const all = [...families, (metrics.speed + metrics.align) / 2];
      return all.reduce((sum, gain) => sum + gain, 0) / all.length;
    }
    case 'command':
      // From nothing there is no ratio: a bigger buff wins, a longer compression reach (km) breaks a tie.
      return hasCommand(before)
        ? commandGain(before, after)
        : commandOf(after).strength * 1e6 + commandOf(after).compression / 1000;
    case 'ewar': {
      const [was, now] = [ewarOf(before), ewarOf(after)];
      // Each kind against its own baseline; a kind the swap drops counts as lost.
      const kinds = Object.entries(was.byKind).map(
        ([kind, strength]) => [strength, now.byKind[kind as keyof typeof now.byKind] ?? 0] as const
      );
      return meanGain([...kinds, [was.range, now.range]]);
    }
  }
}

/** Cheaper may give up this much damage, tank or speed: a bit worse for a lot less ISK is the point. Deliberately looser than Make it fit's `STAT_TOLERANCE`. */
const CHEAPER_TOLERANCE = 0.1;

/** Whether the fit has a module the pilot switches on (an MWD, a booster, a weapon). */
const hasToggledModule = (stats: FittingStats): boolean =>
  stats.modules.some((module) => module.maxState === 'active' || module.maxState === 'overload');

/** A cover for a fix that breaks the capacitor: the swapped fit holds a stable one. */
const capacitorHolds = (stats: FittingStats): boolean => stats.capacitor.stable;

/** The fit with every toggled module switched off. */
const withTogglesOff = (fitting: Fitting): Fitting => ({
  ...fitting,
  modules: fitting.modules.map((module) =>
    module.state === 'active' || module.state === 'overload'
      ? { ...module, state: 'online' }
      : module
  ),
});

/** The figures an Improve Job's drop limits read. */
function limitFigures(
  s: FittingStats,
  target: TargetProfile | undefined
): Record<LimitStat, number> {
  return {
    damage: damageOf(s, target),
    speed: s.navigation.maxVelocity,
    ehp: s.ehp,
    sustained: s.tank.sustainedEffective,
  };
}

/** The Improve Job a check is made under; `makeover` holds the fit to every drop limit, not just a single swap's. */
export interface JobGuard {
  job?: ImproveJob;
  space?: ExploreSpace;
  makeover?: boolean;
}

/** The first Guardrail `after` breaks, or null. */
export function brokenGuardrail(
  goal: ImproveGoal,
  before: FittingStats,
  after: FittingStats,
  target: TargetProfile | undefined,
  conversion?: TankConversion,
  guard?: JobGuard
): Guardrail | null {
  if (fitsResourceBudget(before) && !fitsResourceBudget(after)) return 'budget';
  if (before.capacitor.stable && !after.capacitor.stable) return 'capStable';
  if (
    conversion &&
    before.tank.sustainedEffective > 0 &&
    after.tank.sustainedEffective < before.tank.sustainedEffective * CONVERSION_KEEPS_SUSTAINED
  )
    return 'keepsTank';
  if (guard?.job) {
    const limits = guard.makeover
      ? dropLimitsOf(guard.job, guard.space, goal)
      : swapLimitsOf(guard.job, guard.space, goal);
    const broke = firstLimitBreach(
      limits,
      limitFigures(before, target),
      limitFigures(after, target)
    );
    if (broke) return broke === 'ehp' || broke === 'sustained' ? 'keepsTank' : 'keepsStats';
  }
  if (goal === 'cheaper') {
    const kept: [number, number][] = [
      [damageOf(before, target), damageOf(after, target)],
      [before.ehp, after.ehp],
      [before.navigation.maxVelocity, after.navigation.maxVelocity],
    ];
    if (kept.some(([b, a]) => b > 0 && (b - a) / b > CHEAPER_TOLERANCE)) return 'keepsStats';
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
  /** Whether the pilot's skills alone allow the module, for a fitted one (its hull fit is not in question); absent: `flyable`. */
  pilotCanFly?: (slot: FittingSlotKind, typeId: number) => boolean;
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
  /** The Improve Job: its freed jobs may go. Absent: today's guard. */
  job?: ImproveJob;
  /** Explore's space: Dangerous keeps tank modules tank modules. */
  space?: ExploreSpace;
}

const DEFAULT_OPTIONS: CandidateOptions = {
  goal: 'overall',
  reach: 'upgrade',
  defense: 'keep',
  includeRigs: true,
  includeOfficer: false,
};

/** Targets tried per fitted module type, and fills per rack: the search is whole-fit calculations in a worker. */
export const TARGETS_PER_MODULE = 20;
export const FILLS_PER_RACK = 40;
/** The most candidates one search checks; fits that need more show "Show best so far". */
export const MAX_CANDIDATES = 400;

/** Candidate tiers: Upgrade, Rebalance, Rework, then the empty-slot fills. */
const FILL_TIER = 3;

/** The racks an empty slot is filled in. */
export const FILL_RACKS: readonly FittingSlotKind[] = ['high', 'medium', 'low', 'rig'];

/** The tank sides a search uses: the chosen one, else the fit's own, else both. */
export function defenseSides(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined,
  defense: DefenseChoice
): DefenseSide[] {
  if (defense !== 'keep') return [defense];
  const side = fittedSide(modules, groupOf);
  return side ? [side] : ['shield', 'armor'];
}

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

/** Conversions offered per search: each is a whole-fit calculation. */
const CONVERSIONS_PER_SEARCH = 40;
/** Most modules a conversion displaces from a full chosen-side rack. */
const MAX_DISPLACED = 3;
/** Sizes tried per tank group (Tech II first), so the hull's right plate or extender is among them. */
const SIZES_PER_GROUP = 3;
/** Rig groups: a rig is never stripped or refilled by a conversion. */
const RIG_TANK_GROUPS: ReadonlySet<number> = new Set([773, 774]);

/** Tech II first, then Tech I, then the rest; a tie goes to the newer type id. */
const metaRank = (index: VariationIndex, typeId: number) => {
  const meta = index.types[typeId]?.metaGroupId ?? 0;
  return meta === 2 ? 0 : meta === 1 ? 1 : 2;
};

type Allowed = (
  typeId: number,
  slot: FittingSlotKind,
  removedGroup: number | undefined,
  removed: number
) => boolean;

const isTankRack = (slot: FittingSlotKind): slot is TankRack =>
  (TANK_RACKS as readonly string[]).includes(slot);

/** The other side's tank modules a conversion to `side` removes: never a rig, a job module or a unique group (so a Damage Control stays). */
function strippedForConversion(
  modules: readonly FittingModule[],
  side: DefenseSide,
  groupOf: (typeId: number) => number | undefined
): FittingModule[] {
  return modules.filter((module) => {
    const group = groupOf(module.typeId);
    if (group === undefined || !isTankRack(module.slot)) return false;
    if (UNIQUE_GROUPS.has(group) || jobOf(group) !== null) return false;
    const own = sideOf(group);
    return own !== null && own !== side;
  });
}

/** The rack a conversion refills (the first the side's primary group fits) and its groups there, primary first. */
function refillRack(
  goal: ImproveGoal,
  side: DefenseSide,
  fits: (group: number, slot: TankRack) => boolean
): { rack: TankRack; groups: number[] } | null {
  const sideGroups = reworkGroups(goal, [side]).filter(
    (group) => sideOf(group) === side && !RIG_TANK_GROUPS.has(group)
  );
  const primary = sideGroups[0];
  const rack = primary === undefined ? undefined : TANK_RACKS.find((slot) => fits(primary, slot));
  return rack === undefined
    ? null
    : { rack, groups: sideGroups.filter((group) => fits(group, rack)) };
}

/** The modules in the refilled rack a full rack may give up: no job, not tank; those least tied to the goal first, then the last slot. */
function displaceableIn(
  inRack: readonly FittingModule[],
  goal: ImproveGoal,
  groupOf: (typeId: number) => number | undefined
): FittingModule[] {
  const goalGroups = new Set(reworkGroups(goal, []));
  const tied = (module: FittingModule) => Number(goalGroups.has(groupOf(module.typeId) ?? -1));
  return inRack
    .filter((module) => {
      const group = groupOf(module.typeId);
      return group !== undefined && jobOf(group) === null && !TANK_GROUPS.has(group);
    })
    .sort((a, b) => tied(a) - tied(b) || b.slotIndex - a.slotIndex);
}

/** `removed` grouped by type, as a conversion lists them. */
function removesOf(removed: readonly FittingModule[]): TankConversion['removes'] {
  const removes: TankConversion['removes'] = [];
  for (const module of removed) {
    const at = { slot: module.slot, slotIndex: module.slotIndex };
    const entry = removes.find((r) => r.typeId === module.typeId);
    if (entry) entry.at.push(at);
    else removes.push({ typeId: module.typeId, at: [at] });
  }
  return removes;
}

/** The emptied slots per rack that `refilled` (in `rack`) does not fill again. */
function freedOf(
  removed: readonly FittingModule[],
  rack: TankRack,
  refilled: readonly number[]
): TankConversion['freed'] {
  const freed = { high: 0, medium: 0, low: 0 };
  for (const module of removed)
    if (isTankRack(module.slot) && !(module.slot === rack && refilled.includes(module.slotIndex)))
      freed[module.slot]++;
  return freed;
}

/**
 * The type lists to fill `slots` with: one group in every slot, or the primary
 * group first and another for the rest, each at every size tried. Duplicates
 * (a group with fewer sizes) are dropped.
 */
function fillPlans(
  groups: readonly number[],
  slots: readonly number[],
  typesOf: (group: number) => readonly number[]
): number[][] {
  const [primary, ...others] = groups;
  if (primary === undefined) return [];
  const pairs: [number, number][] = [
    ...groups.map((group): [number, number] => [group, group]),
    ...(slots.length > 1 ? others.map((group): [number, number] => [primary, group]) : []),
  ];
  const plans = new Map<string, number[]>();
  for (let size = 0; size < SIZES_PER_GROUP; size++)
    for (const [first, rest] of pairs) {
      const pick = (group: number) => {
        const types = typesOf(group);
        return types[Math.min(size, types.length - 1)];
      };
      const [head, tail] = [pick(first), pick(rest)];
      if (head === undefined || tail === undefined) continue;
      const plan = slots.map((_, i) => (i === 0 ? head : tail));
      plans.set(plan.join(','), plan);
    }
  return [...plans.values()];
}

/** The fills as a chain of adds, one link per type; null for none. */
function addChain(slotTypes: readonly [number, number][], rack: TankRack): ImproveCandidate | null {
  const byType = new Map<number, ModuleAt[]>();
  for (const [slotIndex, typeId] of slotTypes)
    byType.set(typeId, [...(byType.get(typeId) ?? []), { slot: rack, slotIndex }]);
  return [...byType].reduceRight<ImproveCandidate | null>(
    (next, [toTypeId, at]) => ({
      fromTypeId: null,
      toTypeId,
      at,
      ...(next ? { pairedWith: next } : {}),
    }),
    null
  );
}

/**
 * Whole-tank conversions to `side`: every non-rig module of the other side's
 * tank removed (`strippedForConversion`), the chosen side's rack refilled
 * with a few sizes of one or two tank groups, the other rack's freed slots
 * left empty. A full rack displaces its weakest unprotected modules, a few
 * counts, as separate candidates; scoring whole decides which beat the fit.
 */
function tankConversions(
  modules: readonly FittingModule[],
  side: DefenseSide,
  goal: ImproveGoal,
  pool: ModulePool,
  slotCounts: Readonly<Record<FittingSlotKind, number>>,
  index: VariationIndex,
  allowed: Allowed
): ImproveCandidate[] {
  const stripped = strippedForConversion(modules, side, pool.groupOf);
  if (stripped.length === 0) return [];

  const typesFor = (group: number, slot: FittingSlotKind): number[] =>
    pool
      .typeIdsInGroup(group)
      .filter((typeId) => allowed(typeId, slot, undefined, 0))
      .sort((a, b) => metaRank(index, a) - metaRank(index, b) || b - a)
      .slice(0, SIZES_PER_GROUP);
  const target = refillRack(goal, side, (group, slot) => typesFor(group, slot).length > 0);
  if (!target) return [];
  const { rack, groups } = target;

  const inRack = modules.filter((module) => module.slot === rack && !stripped.includes(module));
  const taken = new Set(inRack.map((module) => module.slotIndex));
  const free = Array.from({ length: slotCounts[rack] }, (_, i) => i).filter((i) => !taken.has(i));
  const displaceable = displaceableIn(inRack, goal, pool.groupOf);
  // A full rack gives up one to MAX_DISPLACED modules, each count with its own share of the budget.
  const counts =
    free.length > 0
      ? [0]
      : Array.from({ length: Math.min(MAX_DISPLACED, displaceable.length) }, (_, i) => i + 1);
  const share = Math.ceil(CONVERSIONS_PER_SEARCH / Math.max(1, counts.length));

  const out: ImproveCandidate[] = [];
  for (const count of counts) {
    const displaced = displaceable.slice(0, count);
    const slots = [...free, ...displaced.map((module) => module.slotIndex)].sort((a, b) => a - b);
    const removed = [...stripped, ...displaced];
    const conversion: TankConversion = {
      side,
      removes: removesOf(removed),
      freed: freedOf(removed, rack, slots),
    };
    for (const plan of fillPlans(groups, slots, (group) => typesFor(group, rack)).slice(0, share)) {
      const chain = addChain(
        slots.map((slotIndex, i): [number, number] => [slotIndex, plan[i] ?? plan[0] ?? -1]),
        rack
      );
      if (chain) out.push({ ...chain, conversion });
    }
  }
  return out;
}

/** A conversion's identity for ticking: its side and what it removes, so each variant has its own tick key. */
export const conversionKey = (conversion: TankConversion): string =>
  `convert-${conversion.side}-${conversion.removes
    .map((r) => `${r.typeId}:${r.at.map((at) => `${at.slot}${at.slotIndex}`).join('.')}`)
    .join('_')}`;

/**
 * What a conversion does at a glance, walking its chain once: modules
 * `removed`, modules `added`, other-slot downgrades chained behind it
 * (`swapped`, not counted as added), and the slots `freed` per rack.
 */
export function conversionSummary(candidate: ImproveCandidate): {
  removed: number;
  added: number;
  swapped: number;
  freed: TankConversion['freed'];
} {
  let added = 0;
  let swapped = 0;
  for (let link: ImproveCandidate | undefined = candidate; link; link = link.pairedWith) {
    if (link.fromTypeId === null) added += link.at.length;
    else swapped += link.at.length;
  }
  return {
    removed: candidate.conversion?.removes.reduce((sum, r) => sum + r.at.length, 0) ?? 0,
    added,
    swapped,
    freed: candidate.conversion?.freed ?? { high: 0, medium: 0, low: 0 },
  };
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
  const sides = defenseSides(modules, groupOf, o.defense);
  // A chosen side frees the other side's tank modules; nothing else swaps into tank modules.
  const freesTank = o.defense !== 'keep' && TANK_GOALS.has(o.goal);
  const scored: readonly Job[] = unguardedJobs(o.goal, o.job);
  const heldWhole: readonly Job[] = o.job ? HELD_EVERY_COPY[o.job] : [];
  const holdsTank = holdsTankModules(o.job, o.space);

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

  const tiers: ImproveCandidate[][] = Array.from({ length: FILL_TIER + 1 }, () => []);
  for (const [fromTypeId, at] of copies) {
    const slot = at[0].slot;
    // A fitted module the pilot cannot fly is replaced by one they can, whatever the Reach.
    const canFly = o.pool?.pilotCanFly ?? o.pool?.flyable;
    const unflyable = canFly ? !canFly(slot, fromTypeId) : false;
    const from = groupOf(fromTypeId);
    const job = jobOf(from);
    const guardsJob = job !== null && !scored.includes(job);
    const seen = new Set<number>([fromTypeId]);
    // Each tier has its own budget, and only an offered target spends it.
    const taken = [0, 0, 0];
    const canOffer = (typeId: number, group: number | undefined) => {
      if (seen.has(typeId) || !allowed(typeId, slot, from, at.length)) return false;
      if (
        freesTank &&
        group !== undefined &&
        TANK_GROUPS.has(group) &&
        !TANK_GROUPS.has(from ?? -1)
      )
        return false;
      if (holdsTank && TANK_GROUPS.has(from ?? -1) && !TANK_GROUPS.has(group ?? -1)) return false;
      // Never the last module doing a job nobody scores (every copy, for a job the pilot's Job holds whole).
      if (!guardsJob || jobOf(group) === job) return true;
      return (jobsFitted.get(job) ?? 0) - at.length >= 1 && !heldWhole.includes(job);
    };
    const offer = (
      tier: number,
      typeId: number,
      group: number | undefined,
      dropsResourceRig = false
    ) => {
      if (taken[tier] >= TARGETS_PER_MODULE || !canOffer(typeId, group)) return;
      seen.add(typeId);
      taken[tier]++;
      tiers[tier].push({
        fromTypeId,
        toTypeId: typeId,
        at,
        ...(unflyable ? { fixesUnflyable: true } : {}),
        ...(dropsResourceRig ? { dropsResourceRig } : {}),
      });
    };
    // Rework: one target per group in turn, so the groups listed first cannot use the whole budget.
    // Within a group, the members nearest the fitted module's meta group come first.
    const fromMeta = index.types[fromTypeId]?.metaGroupId ?? 0;
    const offerRework = () => {
      const lists = reworkGroups(o.goal, sides)
        .map((group) => ({
          group,
          typeIds: (o.pool?.typeIdsInGroup(group) ?? [])
            .filter((typeId) => canOffer(typeId, group))
            .sort(
              (a, b) =>
                Math.abs((index.types[a]?.metaGroupId ?? 0) - fromMeta) -
                Math.abs((index.types[b]?.metaGroupId ?? 0) - fromMeta)
            ),
        }))
        .filter((list) => list.typeIds.length > 0);
      for (let i = 0; lists.some((list) => i < list.typeIds.length); i++)
        for (const { group, typeIds } of lists) if (i < typeIds.length) offer(2, typeIds[i], group);
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
    // A CPU or powergrid rig the fit does not need becomes a hacking, scanning, speed or align rig, whatever the Reach.
    const resourceRig =
      o.pool && o.goal === 'explore' && slot === 'rig' && RESOURCE_RIG_GROUPS.includes(from ?? -1);
    if (o.pool && resourceRig) {
      for (const group of EXPLORE_RIG_GROUPS)
        for (const typeId of o.pool.typeIdsInGroup(group)) offer(2, typeId, group, true);
    }
    if (o.pool && o.reach === 'rework') {
      offerRework();
    }
    // Whatever the Reach found, an unflyable module is replaced: the same group when no variant was found, then the goal's groups.
    if (o.pool && unflyable) {
      if (taken[0] + taken[1] + taken[2] === 0 && from !== undefined)
        for (const typeId of o.pool.typeIdsInGroup(from)) offer(1, typeId, from);
      if (taken[0] + taken[1] + taken[2] === 0) offerRework();
    }
  }

  // A fit tanking the other side may convert whole, which no single swap scores well.
  const conversions =
    o.pool && o.slotCounts && freesTank && o.reach !== 'upgrade' && o.defense !== 'keep'
      ? tankConversions(modules, o.defense, o.goal, o.pool, o.slotCounts, index, allowed)
      : [];

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
          tiers[FILL_TIER].push({
            fromTypeId: null,
            toTypeId: typeId,
            at: [{ slot, slotIndex: free }],
          });
        }
      }
    }
  }
  // Replacing an unflyable module is never cut by the cap, and a conversion (no single swap finds it) comes next.
  const all = tiers.flat();
  const fixes = all.filter((candidate) => candidate.fixesUnflyable);
  return [...fixes, ...conversions, ...all.filter((candidate) => !candidate.fixesUnflyable)].slice(
    0,
    o.limit ?? MAX_CANDIDATES
  );
}

/** Best score first; a tie goes to the cheaper swap; an unpriced swap sorts after every priced one. */
export function rankImproveOptions<T extends ImproveOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => {
    const ap = a.iskDelta === null;
    const bp = b.iskDelta === null;
    const af = a.candidate.fixesUnflyable === true;
    if (af !== (b.candidate.fixesUnflyable === true)) return af ? -1 : 1;
    if (ap !== bp) return ap ? 1 : -1;
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
  });
}

/** Hub sell price of every part (`ImproveOption.iskDelta`). */
export function iskDeltaOf(
  candidate: ImproveCandidate,
  priceOf: (typeId: number) => number | null
): number | null {
  const to = priceOf(candidate.toTypeId);
  // A fitted rig is destroyed when removed: a rig slot costs the full new rig, with no refund for the old one.
  const rigSlot = candidate.at[0]?.slot === 'rig';
  const from = candidate.fromTypeId === null || rigSlot ? 0 : priceOf(candidate.fromTypeId);
  let isk: number | null = to === null || from === null ? null : (to - from) * candidate.at.length;
  // A conversion's removed modules (never rigs) are sold or dropped from the shopping list.
  for (const { typeId, at } of candidate.conversion?.removes ?? []) {
    const price = priceOf(typeId);
    isk = isk === null || price === null ? null : isk - price * at.length;
  }
  if (candidate.pairedWith) {
    const paired = iskDeltaOf(candidate.pairedWith, priceOf);
    isk = isk === null || paired === null ? null : isk + paired;
  }
  return isk;
}

/** The best gain among the options, or null when nothing helps: the Defense Choice compares sides by it. */
export function bestScore(result: ImproveResult): number | null {
  const scores = [...result.noDownside, ...result.tradeOffs].map((option) => option.score);
  return scores.length > 0 ? Math.max(...scores) : null;
}

/**
 * The result cut to the options that suit `side`, so a side is never credited
 * with a swap that only moves the other side's module. `strict` also drops
 * options that touch no tank module (a weapon, a Damage Control) and is how a
 * side's figure is counted; the list keeps them. `checked` is kept: it counts
 * the search, not the options.
 */
export function onlySide(
  result: ImproveResult,
  side: DefenseSide,
  groupOf: (typeId: number) => number | undefined,
  strict = true
): ImproveResult {
  const keep = (option: ImproveOption) => {
    const group = groupOf(option.candidate.toTypeId);
    const own = group === undefined ? null : sideOf(group);
    return own === side || (!strict && own === null);
  };
  return {
    ...result,
    noDownside: result.noDownside.filter(keep),
    tradeOffs: result.tradeOffs.filter(keep),
    rejected: result.rejected.filter(keep),
  };
}

/**
 * The result cut to the options on neither side (Damage Control, hull, resist-all
 * modules): the "Either" figure of the Defense Choice summary.
 */
export function onlyNeutral(
  result: ImproveResult,
  groupOf: (typeId: number) => number | undefined
): ImproveResult {
  const keep = (option: ImproveOption) => {
    const group = groupOf(option.candidate.toTypeId);
    return group === undefined || sideOf(group) === null;
  };
  return {
    ...result,
    noDownside: result.noDownside.filter(keep),
    tradeOffs: result.tradeOffs.filter(keep),
    rejected: result.rejected.filter(keep),
  };
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
  /** Carry more: the hold scored (default the cargo hold). */
  hold?: ImproveHold;
  /** The Improve Job (and for Explore, its space): Best overall's weights and the Explore Dangerous tank guard. Absent: today's. */
  job?: ImproveJob;
  space?: ExploreSpace;
  /** The total fit price may not pass it. Null: no limit. */
  iskBudget?: number | null;
  /** What the fit costs now, for the total budget. */
  fitTotal?: number | null;
  /** Module and rig swaps that pay for an unflyable-module fix that overruns the fit. */
  compensators?: FlyableCompensators;
  /** After each candidate: how many are done, of how many. */
  onProgress?: (checked: number, total: number) => void;
  /** Cancel: nothing comes back. */
  isCancelled?: () => boolean;
  /** "Show best so far": stop and rank what is done. */
  shouldStop?: () => boolean;
  /**
   * How many single swaps `stats` may work on at once (default 1). Their
   * results are still scored in candidate order, so the result is the one a
   * serial run gives, however the calculations finish.
   */
  concurrency?: number;
}

/** Adds that gained on the goal but did not fit the CPU or powergrid, tried with a downgrade. */
const PAIR_SEEDS = 5;

/**
 * Whether a change costing `iskDelta` (plus `extra`, an implant set bought with
 * it) passes the pilot's budget: the total fit price. No cap, or an unpriced
 * change, never blocks.
 */
export function overIskBudget(
  iskBudget: number | null,
  fitTotal: number | null,
  iskDelta: number | null,
  extra = 0
): boolean {
  if (iskBudget === null || (iskDelta === null && extra === 0)) return false;
  // An unpriced change adds nothing it can be charged, but the implants bought with it still count.
  const spent = (iskDelta ?? 0) + extra;
  return (fitTotal ?? 0) + spent > iskBudget;
}

/** Fixes over budget that get a compensation search, and the bundles kept for each. */
const FLYABLE_SEEDS = 8;
const FLYABLE_PER_FIX = 3;

/**
 * The module and rig swaps that could pay for `fix` when it overruns the fit:
 * called with the fit as the fix leaves it. Absent: no compensation is tried.
 */
export type FlyableCompensators = (fix: ImproveCandidate) => readonly FitSwap[];

/** How many module changes a candidate makes, the paired ones included. */
const changeCount = (candidate: ImproveCandidate): number =>
  1 + (candidate.pairedWith ? changeCount(candidate.pairedWith) : 0);

/** `fix` with each swap chained behind it as a paired change, so one Apply makes them all. */
function bundleOf(
  fix: ImproveCandidate,
  swaps: readonly FitSwap[],
  covers: NonNullable<ImproveCandidate['covers']>
): ImproveCandidate {
  const chain = chainOf(swaps);
  return chain ? { ...fix, pairedWith: chain, covers } : fix;
}

/** The swaps as one candidate with the rest chained behind it; undefined for none. */
export function chainOf(swaps: readonly FitSwap[]): ImproveCandidate | undefined {
  return swaps.reduceRight<ImproveCandidate | undefined>(
    (next, swap) => ({
      fromTypeId: swap.fromTypeId,
      toTypeId: swap.toTypeId,
      at: [{ slot: swap.slot, slotIndex: swap.slotIndex }],
      ...(next ? { pairedWith: next } : {}),
    }),
    undefined
  );
}

/** Fewest changes first, then the cheaper; an unpriced bundle after every priced one. */
function rankFlyable<T extends ImproveOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => {
    const changes = changeCount(a.candidate) - changeCount(b.candidate);
    if (changes !== 0) return changes;
    if ((a.iskDelta === null) !== (b.iskDelta === null)) return a.iskDelta === null ? 1 : -1;
    return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
  });
}

const isNoDownside = (option: ImproveOption) => option.lost.length === 0;

/** Null when cancelled. */
export async function findImprovements({
  fitting,
  before,
  goal,
  candidates,
  stats,
  priceOf,
  target,
  hold = DEFAULT_IMPROVE_HOLD,
  job,
  space,
  iskBudget = null,
  fitTotal = null,
  compensators,
  onProgress,
  isCancelled,
  shouldStop,
  concurrency = 1,
}: FindImprovementsParams): Promise<ImproveResult | null> {
  const kept: ImproveOption[] = [];
  const rejected: RejectedOption[] = [];
  const flyable: ImproveOption[] = [];
  const flyableBlocked: RejectedOption[] = [];
  const overrun: RejectedOption[] = [];
  // Every swap's own result, gain or not: a pair's downgrade is one that frees CPU or powergrid.
  const swaps: { candidate: ImproveCandidate; after: FittingStats }[] = [];
  let checked = 0;
  let failed = 0;
  let stopped = false;

  /** Whether a ship with toggled modules is stable once they are off; false for one with none. */
  async function stableWhenToggledOff(swapped: Fitting, after: FittingStats): Promise<boolean> {
    if (!hasToggledModule(after)) return false;
    try {
      return (await stats(withTogglesOff(swapped))).capacitor.stable;
    } catch {
      // Blocked, the cautious side: a failed calculation must not let a fix break the capacitor.
      return false;
    }
  }

  /** Scores one calculated change; false when cancelled mid-way is the caller's concern. */
  async function take(
    candidate: ImproveCandidate,
    swapped: Fitting,
    after: FittingStats
  ): Promise<boolean> {
    // The game refuses a fit that breaks a fitting rule the open one keeps: never offered.
    if (newRuleBreaks(before.ruleBreaks, after.ruleBreaks).length > 0) return false;
    const iskDelta = iskDeltaOf(candidate, priceOf);
    const score = scoreOf(goal, before, after, iskDelta, target, hold, job);
    const fix = candidate.fixesUnflyable === true;
    if (!fix && (score === null || score <= (goal === 'cheaper' ? 0 : EPSILON))) return false;
    const option: ImproveOption = {
      candidate,
      fitting: swapped,
      after,
      score: score ?? 0,
      iskDelta,
      lost: lostStats(before, after),
    };
    const overSpend = overIskBudget(iskBudget, fitTotal, iskDelta);
    // Flying it beats keeping the stats: only the fit's resources, a stable capacitor with nothing left to toggle on, and the spend still bind.
    const broken = brokenGuardrail(goal, before, after, target, candidate.conversion, {
      job,
      space,
    });
    // A CPU or powergrid rig the fit needs is not a swap to offer, not even a greyed one.
    if (candidate.dropsResourceRig && broken === 'budget') return false;
    // A ship that is stable with its toggled modules off is fine to fix: the capacitor is then the pilot's to spend.
    const capStillBinds =
      fix && broken === 'capStable' && !(await stableWhenToggledOff(swapped, after));
    const guardrail =
      (fix && broken !== 'budget' && !capStillBinds ? null : broken) ??
      (overSpend ? 'spend' : null);
    // A fix is its own list: a gain's rejection is "closest swap", a fix's is a greyed row.
    if (guardrail) (fix ? flyableBlocked : rejected).push({ ...option, guardrail });
    else (fix ? flyable : kept).push(option);
    return true;
  }

  // Not `runPool`: results are scored in candidate order, so calculations run ahead of the one being scored, `concurrency` at once; a failure is kept as null, never a loose rejection.
  const started = new Map<number, { swapped: Fitting; after: Promise<FittingStats | null> }>();
  const window = Math.max(1, concurrency);
  let nextToStart = 0;
  const startUpTo = (last: number) => {
    for (; nextToStart <= last && nextToStart < candidates.length; nextToStart++) {
      const swapped = applyImproveCandidate(fitting, candidates[nextToStart]);
      started.set(nextToStart, {
        swapped,
        after: Promise.resolve()
          .then(() => stats(swapped))
          .catch(() => null),
      });
    }
  };
  for (const [index, candidate] of candidates.entries()) {
    if (isCancelled?.()) return null;
    if (shouldStop?.()) {
      stopped = true;
      break;
    }
    startUpTo(index + window - 1);
    const { swapped, after } = started.get(index)!;
    started.delete(index);
    const result = await after;
    // Left out: one variation's calculation failing must not end the search.
    if (result === null) failed++;
    if (isCancelled?.()) return null;
    checked++;
    onProgress?.(checked, candidates.length);
    if (result === null) continue;
    if (candidate.fromTypeId !== null) swaps.push({ candidate, after: result });
    await take(candidate, swapped, result);
  }
  // Every calculation failed: the engine is broken, not the fit beyond improving.
  if (checked > 0 && failed === checked) throw new Error('Every Improve calculation failed');

  // Pair moves: an add that gained but did not fit, with a swap that frees what it needs.
  // Estimated from the singles' freed CPU and powergrid, then the best few calculated whole,
  // as Make it fit does (`PAIR_LIMIT`).
  const seeds = rejected
    .filter(
      (option) =>
        option.guardrail === 'budget' &&
        option.candidate.fromTypeId === null &&
        !option.candidate.conversion
    )
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
      if (fitsResourceBudget(after)) await take(candidate, swapped, after);
    } catch {
      // Left out, as a single's failure is.
    }
  }

  // A fix over budget or breaking a stable capacitor: the module and rig swaps that put the fit right, so Apply is never locked.
  if (compensators) {
    const seedsFor = (guardrail: Guardrail) =>
      flyableBlocked.filter((option) => option.guardrail === guardrail).slice(0, FLYABLE_SEEDS);
    const overBudget = seedsFor('budget');
    // Implants shift CPU and powergrid, not the capacitor: only an over-budget fix is offered them.
    overrun.push(...overBudget);
    const seeds = [...overBudget, ...seedsFor('capStable')];
    for (const seed of seeds) {
      if (isCancelled?.()) return null;
      if (shouldStop?.()) {
        stopped = true;
        break;
      }
      const swaps = compensators(seed.candidate);
      if (swaps.length === 0) continue;
      const forCapacitor = seed.guardrail === 'capStable';
      let found: Awaited<ReturnType<typeof findFitSwaps>>;
      try {
        found = await findFitSwaps({
          fitting: seed.fitting,
          before: seed.after,
          candidates: swaps,
          stats,
          priceOf,
          isCancelled,
          ...(forCapacitor ? { accepts: capacitorHolds } : {}),
        });
      } catch {
        // A failed search leaves the fix greyed with its reason; it must not end the whole search.
        continue;
      }
      if (isCancelled?.()) return null;
      if (found.options.length === 0) continue;
      // The fix leaves its greyed row only once a bundle took its place (a rule break can drop them all).
      const taken: boolean[] = [];
      for (const option of found.options.slice(0, FLYABLE_PER_FIX))
        taken.push(
          await take(
            bundleOf(seed.candidate, option.swaps, forCapacitor ? 'capacitor' : 'budget'),
            option.fitting,
            option.after
          )
        );
      if (taken.some(Boolean)) flyableBlocked.splice(flyableBlocked.indexOf(seed), 1);
    }
  }

  const ranked = rankImproveOptions(kept);
  return {
    makeFlyable: rankFlyable(flyable),
    flyableOverrun: overrun,
    flyableBlocked: rankFlyable(flyableBlocked),
    noDownside: ranked.filter(isNoDownside),
    tradeOffs: ranked.filter((option) => !isNoDownside(option)),
    rejected: [...rejected].sort((a, b) => b.score - a.score).slice(0, REJECTED_LIMIT),
    checked,
    stopped,
  };
}
