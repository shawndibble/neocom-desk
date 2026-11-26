import type { VariationIndex } from '../../market/variations';
import { getVariations } from '../../market/variations';
import { addModule, removeModule, type ModuleAt } from '../fittingEdit';
import { peakAppliedDps } from '../implantFinder';
import { NO_EXPLORE, type ExploreStats } from '../explore';
import {
  EXPLORE_RIG_GROUPS,
  jobOf,
  reworkGroups,
  RESOURCE_RIG_GROUPS,
  TANK_GROUPS,
  UNIQUE_GROUPS,
  sideOf,
  type DefenseSide,
} from './improveGroups';
import { breakTies, type JobCommonality } from '../hullCommonality';
import { candidateFilter, FILL_RACKS, offerableIn } from './improveCandidateFilter';
import { isMutated, placeKey } from './improveMutated';
import {
  dropLimitsOf,
  firstLimitBreach,
  isTankStat,
  overallWeightsOf,
  swapLimitsOf,
  type ImproveJob,
  type JobSetting,
  type LimitStat,
} from './improveJob';
import { coveringFreed, freedBy } from './improvePairSeed';
import { newRuleBreaks } from '../ruleBreaks';
import { applyModuleUpgrade } from '../moduleUpgrades';
import { findFitSwaps, PAIR_LIMIT, type FitSwap } from '../makeItFit';
import { commandGain, commandOf, hasCommand } from './improveCommand';
import { DEFAULT_GOAL_OF_ROLE, hullRoleOf, roleUnlocks, type HullRef } from './improveRole';
import { ewarOf, tackleOf } from './improveTackle';
import { changeVerdict } from '../fittingStatFields';
import { gainMetrics, improveOverall } from '../skillGains';
import { fitsResourceBudget } from '../skillGaps';
import type { TargetProfile } from '../targetProfile';
import { swapChanges, type SwapChange } from '../swapChanges';
import { alignTimeSeconds } from '../stats';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats, HoldStats } from '../types';

export const COMBAT_GOALS = ['overall', 'damage', 'tank', 'speed', 'reach', 'cheaper'] as const;
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

export const DEFAULT_IMPROVE_HOLD: ImproveHold = 'cargo';

export const effectiveHold = (holds: HoldStats, preferred: ImproveHold): ImproveHold =>
  heldHold(holds, preferred) ?? preferred;

export function heldHold(holds: HoldStats, preferred: ImproveHold): ImproveHold | null {
  if (holds[preferred] > 0) return preferred;
  return IMPROVE_HOLDS.find((hold) => holds[hold] > 0) ?? null;
}

export type Guardrail = 'budget' | 'capStable' | 'keepsTank' | 'keepsStats' | 'spend';

const CONVERSION_KEEPS_SUSTAINED = 0.5;

export const IMPROVE_REACHES = ['upgrade', 'rebalance', 'rework'] as const;
export type ImproveReach = (typeof IMPROVE_REACHES)[number];

export const DEFENSE_CHOICES = ['keep', 'shield', 'armor'] as const;
export type DefenseChoice = (typeof DEFENSE_CHOICES)[number];

export const TANK_RACKS = ['high', 'medium', 'low'] as const;
export type TankRack = (typeof TANK_RACKS)[number];

export interface TankConversion {
  side: DefenseSide;
  removes: { typeId: number; at: ModuleAt[] }[];
  freed: Record<TankRack, number>;
}

export interface ImproveCandidate {
  fromTypeId: number | null;
  toTypeId: number;
  at: ModuleAt[];
  pairedWith?: ImproveCandidate;
  losesRoll?: boolean;
  fixesUnflyable?: boolean;
  covers?: 'budget' | 'capacitor';
  dropsResourceRig?: boolean;
  conversion?: TankConversion;
  addsPropulsionFor?: ImproveJob;
}

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
  score: number;
  iskDelta: number | null;
  lost: LostStat[];
}

export type LostStat = SwapChange;

const TIGHT_BUDGET = 0.9;

const BUDGET_USED = {
  cpuUsed: 'cpuTotal',
  powergridUsed: 'powergridTotal',
  calibrationUsed: 'calibrationTotal',
} as const;

export function lostStats(before: FittingStats, after: FittingStats): LostStat[] {
  return swapChanges(before, after).filter(({ kind, change }) => {
    if (changeVerdict(change) !== 'worse') return false;
    if (kind === 'role') return true;
    const total = BUDGET_USED[change.key as keyof typeof BUDGET_USED];
    return total === undefined || (after[total] > 0 && change.after > after[total] * TIGHT_BUDGET);
  });
}

export interface RejectedOption extends ImproveOption {
  guardrail: Guardrail;
}

export interface ImproveResult {
  makeFlyable: ImproveOption[];
  flyableOverrun: RejectedOption[];
  flyableBlocked: RejectedOption[];
  noDownside: ImproveOption[];
  tradeOffs: ImproveOption[];
  rejected: RejectedOption[];
  checked: number;
  stopped: boolean;
}

export const REJECTED_LIMIT = 5;

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
export const remoteRepairOf = (s: FittingStats) => {
  const { shield, armor, hull } = s.support.remoteRepair;
  return shield + armor + hull;
};
const canAlign = (s: FittingStats) => alignTimeSeconds(s.navigation.mass, s.navigation.agility) > 0;
const hasShipWeapons = (s: FittingStats) =>
  s.offense.chargelessWeaponCount > 0 ||
  s.applied.weapons.some((w) => w.kind === 'turret' || w.kind === 'missile' || w.kind === 'area');

export function goalAvailability(
  goal: ImproveGoal,
  before: FittingStats,
  hull?: HullRef
): GoalAvailability {
  if (roleUnlocks(hullRoleOf(hull)).includes(goal)) return { available: true };
  if (goal === 'damage' && !isArmed(before)) return { available: false, reason: 'noWeapons' };
  if (goal === 'reach' && !hasShipWeapons(before))
    return { available: false, reason: 'noGunsOrLaunchers' };
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

export function searchableGoal(
  goal: ImproveGoal,
  before: FittingStats,
  hull: HullRef | undefined
): ImproveGoal {
  if (goalAvailability(goal, before, hull).available) return goal;
  const fallback = DEFAULT_GOAL_OF_ROLE[hullRoleOf(hull)];
  return goalAvailability(fallback, before, hull).available ? fallback : 'overall';
}

export function damageOf(s: FittingStats, target: TargetProfile | undefined): number {
  if (target && s.applied.weapons.length > 0) return peakAppliedDps(s, target);
  return s.offense.sustainedDps;
}

function relative(before: number, after: number): number {
  if (before === after) return 0;
  if (before === 0) return after > 0 ? 1 : -1;
  return (after - before) / Math.abs(before);
}

function gainOrAbsolute(before: number, after: number): number {
  return before === 0 ? after - before : relative(before, after);
}

function meanGain(pairs: readonly (readonly [number, number])[]): number {
  const present = pairs.filter(([before]) => before > 0);
  if (present.length === 0) return 0;
  return (
    present.reduce((sum, [before, after]) => sum + relative(before, after), 0) / present.length
  );
}

const cycleRate = (seconds: number): number => (seconds > 0 ? 1 / seconds : 0);

function exploreFamilyGains(before: ExploreStats, after: ExploreStats): number[] {
  const families: number[] = [];
  if (before.analyzers.length > 0) {
    const gains = before.analyzers.flatMap((was, i) => {
      const now = after.analyzers[i] ?? NO_EXPLORE.hacking;
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
      const families = exploreFamilyGains(before.explore, after.explore);
      const all = [...families, (metrics.speed + metrics.align) / 2];
      return all.reduce((sum, gain) => sum + gain, 0) / all.length;
    }
    case 'command':
      return hasCommand(before)
        ? commandGain(before, after)
        : commandOf(after).strength * 1e6 + commandOf(after).compression / 1000;
    case 'ewar': {
      const [was, now] = [ewarOf(before), ewarOf(after)];
      const kinds = Object.entries(was.byKind).map(
        ([kind, strength]) => [strength, now.byKind[kind as keyof typeof now.byKind] ?? 0] as const
      );
      return meanGain([...kinds, [was.range, now.range]]);
    }
  }
}

const CHEAPER_TOLERANCE = 0.1;

const hasToggledModule = (stats: FittingStats): boolean =>
  stats.modules.some((module) => module.maxState === 'active' || module.maxState === 'overload');

const capacitorHolds = (stats: FittingStats): boolean => stats.capacitor.stable;

const withTogglesOff = (fitting: Fitting): Fitting => ({
  ...fitting,
  modules: fitting.modules.map((module) =>
    module.state === 'active' || module.state === 'overload'
      ? { ...module, state: 'online' }
      : module
  ),
});

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

export interface JobGuard {
  jobSetting?: JobSetting;
  makeover?: boolean;
}

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
  if (guard?.jobSetting) {
    const limits = guard.makeover
      ? dropLimitsOf(goal, guard.jobSetting)
      : swapLimitsOf(goal, guard.jobSetting);
    const broke = firstLimitBreach(
      limits,
      limitFigures(before, target),
      limitFigures(after, target)
    );
    if (broke) return isTankStat(broke) ? 'keepsTank' : 'keepsStats';
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

export interface ModulePool {
  groupOf: (typeId: number) => number | undefined;
  typeIdsInGroup: (groupId: number) => readonly number[];
  published: (typeId: number) => boolean;
  flyable?: (slot: FittingSlotKind, typeId: number) => boolean;
  pilotCanFly?: (slot: FittingSlotKind, typeId: number) => boolean;
  nameOf?: (typeId: number) => string | undefined;
}

export interface CandidateOptions {
  goal: ImproveGoal;
  reach: ImproveReach;
  defense: DefenseChoice;
  includeRigs: boolean;
  includeOfficer: boolean;
  allowMutated?: boolean;
  slotCounts?: Readonly<Record<FittingSlotKind, number>>;
  pool?: ModulePool;
  limit?: number;
  jobSetting?: JobSetting;
  commonality?: JobCommonality | null;
}

const DEFAULT_OPTIONS: CandidateOptions = {
  goal: 'overall',
  reach: 'upgrade',
  defense: 'keep',
  includeRigs: true,
  includeOfficer: false,
};

export const TARGETS_PER_MODULE = 20;
export const FILLS_PER_RACK = 40;
export const MAX_CANDIDATES = 400;

const FILL_TIER = 3;
const COMMON_TIER = 4;

const CONVERSIONS_PER_SEARCH = 40;
const MAX_DISPLACED = 3;
const SIZES_PER_GROUP = 3;
const RIG_TANK_GROUPS: ReadonlySet<number> = new Set([773, 774]);

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

export const conversionKey = (conversion: TankConversion): string =>
  `convert-${conversion.side}-${conversion.removes
    .map((r) => `${r.typeId}:${r.at.map((at) => `${at.slot}${at.slotIndex}`).join('.')}`)
    .join('_')}`;

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

export function improveCandidates(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  options: Partial<CandidateOptions> = {}
): ImproveCandidate[] {
  const o: CandidateOptions = { ...DEFAULT_OPTIONS, ...options };
  const groupOf = o.pool?.groupOf ?? (() => undefined);
  const filter = candidateFilter(modules, groupOf, { ...o, nameOf: o.pool?.nameOf });
  const { freesTank, goalGroups } = filter;
  const tableGroups = goalGroups.filter((group) => !filter.commonGroups.includes(group));

  const copies = new Map<string, { typeId: number; at: ModuleAt[]; mutated: boolean }>();
  for (const module of modules) {
    if (!filter.usesRack(module.slot)) continue;
    const mutated = isMutated(module);
    if (mutated && !o.allowMutated) continue;
    const key = mutated ? `${module.typeId}@${placeKey(module)}` : String(module.typeId);
    const where = { slot: module.slot, slotIndex: module.slotIndex };
    const found = copies.get(key);
    if (found) found.at.push(where);
    else copies.set(key, { typeId: module.typeId, at: [where], mutated });
  }

  const offerable = offerableIn(index, rackOf, o.pool, o.includeOfficer);
  const allowed = (
    typeId: number,
    slot: FittingSlotKind,
    removedGroup: number | undefined,
    removed: number
  ) => {
    if (!offerable(typeId, slot)) return false;
    return !filter.uniqueBlocks(groupOf(typeId), removedGroup, removed);
  };

  const tiers: ImproveCandidate[][] = Array.from({ length: COMMON_TIER + 1 }, () => []);
  for (const { typeId: fromTypeId, at, mutated } of copies.values()) {
    const slot = at[0].slot;
    const canFly = o.pool?.pilotCanFly ?? o.pool?.flyable;
    const unflyable = canFly ? !canFly(slot, fromTypeId) : false;
    const from = groupOf(fromTypeId);
    const seen = new Set<number>([fromTypeId]);
    const taken = [0, 0, 0, 0, 0];
    const canOffer = (typeId: number, group: number | undefined) => {
      if (seen.has(typeId) || !allowed(typeId, slot, from, at.length)) return false;
      if (filter.tankBlocks(group, from) || filter.kindBlocks(typeId, fromTypeId)) return false;
      return !filter.losesJob(group, from, at.length);
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
        ...(mutated ? { losesRoll: true } : {}),
        ...(dropsResourceRig ? { dropsResourceRig } : {}),
      });
    };
    const fromMeta = index.types[fromTypeId]?.metaGroupId ?? 0;
    const offerRework = (groups: readonly number[], tier: number) => {
      const lists = groups
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
        for (const { group, typeIds } of lists)
          if (i < typeIds.length) offer(tier, typeIds[i], group);
    };
    for (const member of getVariations(index, fromTypeId).members) {
      offer(0, member.typeId, groupOf(member.typeId));
    }
    const otherSide = from === undefined ? null : sideOf(from);
    if (o.pool && freesTank && otherSide !== null && otherSide !== o.defense) {
      for (const group of tableGroups)
        if (TANK_GROUPS.has(group))
          for (const typeId of o.pool.typeIdsInGroup(group)) offer(2, typeId, group);
    }
    if (o.pool && from !== undefined && o.reach !== 'upgrade') {
      for (const typeId of o.pool.typeIdsInGroup(from)) offer(1, typeId, from);
    }
    const resourceRig =
      o.pool && o.goal === 'explore' && slot === 'rig' && RESOURCE_RIG_GROUPS.includes(from ?? -1);
    if (o.pool && resourceRig) {
      for (const group of EXPLORE_RIG_GROUPS)
        for (const typeId of o.pool.typeIdsInGroup(group)) offer(2, typeId, group, true);
    }
    if (o.pool && o.reach === 'rework') {
      offerRework(tableGroups, 2);
      offerRework(filter.commonGroups, COMMON_TIER);
    }
    if (o.pool && unflyable) {
      if (taken[0] + taken[1] + taken[2] === 0 && from !== undefined)
        for (const typeId of o.pool.typeIdsInGroup(from)) offer(1, typeId, from);
      if (taken[0] + taken[1] + taken[2] === 0) offerRework(tableGroups, 2);
    }
  }

  const rolls = new Set(modules.filter(isMutated).map(placeKey));
  const stripsRoll = (candidate: ImproveCandidate) =>
    candidate.conversion?.removes.some((removed) =>
      removed.at.some((at) => rolls.has(placeKey(at)))
    ) ?? false;
  const conversions = (
    o.pool && o.slotCounts && freesTank && o.reach !== 'upgrade' && o.defense !== 'keep'
      ? tankConversions(modules, o.defense, o.goal, o.pool, o.slotCounts, index, allowed)
      : []
  )
    .filter((candidate) => o.allowMutated || !stripsRoll(candidate))
    .map((candidate) => (stripsRoll(candidate) ? { ...candidate, losesRoll: true } : candidate));

  if (o.pool && o.slotCounts) {
    const pool = o.pool;
    for (const slot of FILL_RACKS) {
      if (!filter.usesRack(slot)) continue;
      const free = filter.firstFreeSlot(slot, o.slotCounts);
      if (free === null) continue;
      const share = Math.ceil(
        FILLS_PER_RACK / Math.max(1, goalGroups.length - filter.commonGroups.length)
      );
      for (const group of goalGroups) {
        const tier = filter.commonGroups.includes(group) ? COMMON_TIER : FILL_TIER;
        let added = 0;
        for (const typeId of pool.typeIdsInGroup(group)) {
          if (added >= share || !allowed(typeId, slot, undefined, 0)) continue;
          if (filter.kindBlocks(typeId, null)) continue;
          added++;
          tiers[tier].push({
            fromTypeId: null,
            toTypeId: typeId,
            at: [{ slot, slotIndex: free }],
          });
        }
      }
    }
  }
  const all = tiers.flat();
  const fixes = all.filter((candidate) => candidate.fixesUnflyable);
  return [...fixes, ...conversions, ...all.filter((candidate) => !candidate.fixesUnflyable)].slice(
    0,
    o.limit ?? MAX_CANDIDATES
  );
}

export function rankImproveOptions<T extends ImproveOption>(
  options: readonly T[],
  targetShare?: (candidate: ImproveCandidate) => number
): T[] {
  const ranked = [...options].sort((a, b) => {
    const ap = a.iskDelta === null;
    const bp = b.iskDelta === null;
    const af = a.candidate.fixesUnflyable === true;
    if (af !== (b.candidate.fixesUnflyable === true)) return af ? -1 : 1;
    if (ap !== bp) return ap ? 1 : -1;
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
  });
  return breakTies(
    ranked,
    (option) => option.score,
    targetShare && ((option) => targetShare(option.candidate)),
    (a, b) =>
      (a.candidate.fixesUnflyable === true) === (b.candidate.fixesUnflyable === true) &&
      (a.iskDelta === null) === (b.iskDelta === null)
  );
}

export function iskDeltaOf(
  candidate: ImproveCandidate,
  priceOf: (typeId: number) => number | null
): number | null {
  const to = priceOf(candidate.toTypeId);
  const rigSlot = candidate.at.length > 0 && candidate.at.every((where) => where.slot === 'rig');
  const from = candidate.fromTypeId === null || rigSlot ? 0 : priceOf(candidate.fromTypeId);
  let isk: number | null = to === null || from === null ? null : (to - from) * candidate.at.length;
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

export function bestScore(result: ImproveResult): number | null {
  const scores = [...result.noDownside, ...result.tradeOffs].map((option) => option.score);
  return scores.length > 0 ? Math.max(...scores) : null;
}

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
  before: FittingStats;
  goal: ImproveGoal;
  candidates: readonly ImproveCandidate[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  target?: TargetProfile;
  hold?: ImproveHold;
  jobSetting?: JobSetting;
  iskBudget?: number | null;
  fitTotal?: number | null;
  compensators?: FlyableCompensators;
  onProgress?: (checked: number, total: number) => void;
  isCancelled?: () => boolean;
  shouldStop?: () => boolean;
  concurrency?: number;
  targetShare?: (candidate: ImproveCandidate) => number;
}

const PAIR_SEEDS = 5;

export function overIskBudget(
  iskBudget: number | null,
  fitTotal: number | null,
  iskDelta: number | null,
  extra = 0
): boolean {
  if (iskBudget === null || (iskDelta === null && extra === 0)) return false;
  const spent = (iskDelta ?? 0) + extra;
  return (fitTotal ?? 0) + spent > iskBudget;
}

const FLYABLE_SEEDS = 8;
const FLYABLE_PER_FIX = 3;

export type FlyableCompensators = (fix: ImproveCandidate) => readonly FitSwap[];

const changeCount = (candidate: ImproveCandidate): number =>
  1 + (candidate.pairedWith ? changeCount(candidate.pairedWith) : 0);

function bundleOf(
  fix: ImproveCandidate,
  swaps: readonly FitSwap[],
  covers: NonNullable<ImproveCandidate['covers']>
): ImproveCandidate {
  const chain = chainOf(swaps);
  return chain ? { ...fix, pairedWith: chain, covers } : fix;
}

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

function rankFlyable<T extends ImproveOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => {
    const changes = changeCount(a.candidate) - changeCount(b.candidate);
    if (changes !== 0) return changes;
    if ((a.iskDelta === null) !== (b.iskDelta === null)) return a.iskDelta === null ? 1 : -1;
    return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
  });
}

const isNoDownside = (option: ImproveOption) => option.lost.length === 0;

export async function findImprovements({
  fitting,
  before,
  goal,
  candidates,
  stats,
  priceOf,
  target,
  hold = DEFAULT_IMPROVE_HOLD,
  jobSetting,
  iskBudget = null,
  fitTotal = null,
  compensators,
  onProgress,
  isCancelled,
  shouldStop,
  concurrency = 1,
  targetShare,
}: FindImprovementsParams): Promise<ImproveResult | null> {
  const kept: ImproveOption[] = [];
  const rejected: RejectedOption[] = [];
  const flyable: ImproveOption[] = [];
  const flyableBlocked: RejectedOption[] = [];
  const overrun: RejectedOption[] = [];
  const swaps: { candidate: ImproveCandidate; after: FittingStats }[] = [];
  let checked = 0;
  let failed = 0;
  let stopped = false;

  async function stableWhenToggledOff(swapped: Fitting, after: FittingStats): Promise<boolean> {
    if (!hasToggledModule(after)) return false;
    try {
      return (await stats(withTogglesOff(swapped))).capacitor.stable;
    } catch {
      return false;
    }
  }

  async function take(
    candidate: ImproveCandidate,
    swapped: Fitting,
    after: FittingStats
  ): Promise<boolean> {
    if (newRuleBreaks(before.ruleBreaks, after.ruleBreaks).length > 0) return false;
    const iskDelta = iskDeltaOf(candidate, priceOf);
    const score = scoreOf(goal, before, after, iskDelta, target, hold, jobSetting?.job);
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
    const broken = brokenGuardrail(goal, before, after, target, candidate.conversion, {
      jobSetting,
    });
    if (candidate.dropsResourceRig && broken === 'budget') return false;
    const capStillBinds =
      fix && broken === 'capStable' && !(await stableWhenToggledOff(swapped, after));
    const guardrail =
      (fix && broken !== 'budget' && !capStillBinds ? null : broken) ??
      (overSpend ? 'spend' : null);
    if (guardrail) (fix ? flyableBlocked : rejected).push({ ...option, guardrail });
    else (fix ? flyable : kept).push(option);
    return true;
  }

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
    if (result === null) failed++;
    if (isCancelled?.()) return null;
    checked++;
    onProgress?.(checked, candidates.length);
    if (result === null) continue;
    if (candidate.fromTypeId !== null) swaps.push({ candidate, after: result });
    await take(candidate, swapped, result);
  }
  if (checked > 0 && failed === checked) throw new Error('Every Improve calculation failed');

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
    for (const swap of swaps) {
      const estimate = coveringFreed(seed.after, freedBy(before, swap.after));
      if (estimate === null) continue;
      pairs.push({ candidate: { ...seed.candidate, pairedWith: swap.candidate }, estimate });
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
    } catch {}
  }

  if (compensators) {
    const seedsFor = (guardrail: Guardrail) =>
      flyableBlocked.filter((option) => option.guardrail === guardrail).slice(0, FLYABLE_SEEDS);
    const overBudget = seedsFor('budget');
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
        continue;
      }
      if (isCancelled?.()) return null;
      if (found.options.length === 0) continue;
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

  const ranked = rankImproveOptions(kept, targetShare);
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
