/**
 * The implant finder's pure half: what an implant family is, which goals a
 * pilot can ask an implant to improve, how much a candidate moves a goal,
 * where to buy it, and which combinations fix an over-budget fit for the
 * least ISK. The engine runs and price fetches live in
 * `features/fittings/useImplantFinder.ts`.
 */
import { appliedDpsVsRange, graphMaxRange, type AppliedWeapon } from './appliedDps';
import type { TargetProfile } from './targetProfile';
import { withBoosters } from './boosterSideEffects';
import type { FittingImplantSet, FittingStats } from './types';

/** A hardwiring's family and grade, read from its name: `EE-605` is grade 5 of `EE-60x`. */
export interface ImplantGradeName {
  family: string;
  code: string;
  grade: number;
}

const GRADED = /^(.*) ([A-Z]{2}-\d{2,3})(\d)$/;

export function parseImplantGrade(name: string): ImplantGradeName | null {
  const match = GRADED.exec(name);
  if (!match) return null;
  const [, family, prefix, grade] = match;
  return { family: family!, code: `${prefix}${grade}`, grade: Number(grade) };
}

/** A combat booster's strengths, weakest first: "Strong Crash Booster" is grade 4 of "Crash Booster". */
const BOOSTER_GRADES = ['Synth', 'Standard', 'Improved', 'Strong'] as const;
const BOOSTER_GRADED = new RegExp(`^(${BOOSTER_GRADES.join('|')}) (.+)$`);

export function parseBoosterGrade(name: string): ImplantGradeName | null {
  const match = BOOSTER_GRADED.exec(name);
  if (!match) return null;
  const [, strength, family] = match;
  return {
    family: family!,
    code: strength!,
    grade: BOOSTER_GRADES.indexOf(strength as (typeof BOOSTER_GRADES)[number]) + 1,
  };
}

/** What goes in a slot: an implant (slots 1–10) or a combat booster (its own slots). */
export type ImplantKind = 'implant' | 'booster';

export interface ImplantEntry {
  typeId: number;
  name: string;
  slot: number;
  /** Absent: an implant. */
  kind?: ImplantKind;
}

interface MarketGroupLike {
  id: number;
  name: string;
  parentId: number | null;
}
interface MarketTypeLike {
  typeId: number;
  name: string;
  marketGroupId: number;
}

/**
 * Every type in the market tree under a slot group (`slotGroup` captures the
 * slot number), with that slot — the baked SDE carries no slot attribute.
 */
function entriesUnderSlotGroups(
  types: readonly MarketTypeLike[],
  groups: readonly MarketGroupLike[],
  slotGroup: RegExp
): ImplantEntry[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const slotOfGroup = new Map<number, number | null>();
  const resolve = (groupId: number): number | null => {
    if (slotOfGroup.has(groupId)) return slotOfGroup.get(groupId)!;
    const group = byId.get(groupId);
    const match = group ? slotGroup.exec(group.name) : null;
    const slot = match
      ? Number(match[1])
      : group && group.parentId !== null
        ? resolve(group.parentId)
        : null;
    slotOfGroup.set(groupId, slot);
    return slot;
  };
  const entries: ImplantEntry[] = [];
  for (const type of types) {
    const slot = resolve(type.marketGroupId);
    if (slot !== null) entries.push({ typeId: type.typeId, name: type.name, slot });
  }
  return entries;
}

/** Every implant, slotted by its "Implant Slot NN" market group. */
export function implantEntriesFromMarket(
  types: readonly MarketTypeLike[],
  groups: readonly MarketGroupLike[]
): ImplantEntry[] {
  return entriesUnderSlotGroups(types, groups, /^Implant Slot (\d+)$/);
}

/** Every booster, slotted by its "Booster Slot NN" market group. */
export function boosterEntriesFromMarket(
  types: readonly MarketTypeLike[],
  groups: readonly MarketGroupLike[]
): ImplantEntry[] {
  return entriesUnderSlotGroups(types, groups, /^Booster Slot (\d+)$/).map((entry) => ({
    ...entry,
    kind: 'booster' as const,
  }));
}

export interface ImplantGrade {
  typeId: number;
  /** `EE-605`, or a booster's strength (`Strong`); null for one sold in one version only. */
  code: string | null;
  grade: number | null;
}

/** Every grade of one implant or booster — the same bonus at each strength, each its own item. */
export interface ImplantFamily {
  key: string;
  name: string;
  kind: ImplantKind;
  slot: number;
  /** Lowest grade first. */
  grades: ImplantGrade[];
}

export function groupImplantFamilies(entries: readonly ImplantEntry[]): ImplantFamily[] {
  const families = new Map<string, ImplantFamily>();
  for (const entry of entries) {
    const implant = parseImplantGrade(entry.name);
    const parsed = implant ?? parseBoosterGrade(entry.name);
    const key = implant
      ? `${implant.family} ${implant.code.slice(0, -1)}`
      : (parsed?.family ?? entry.name);
    let family = families.get(key);
    if (!family) {
      family = {
        key,
        name: parsed?.family ?? entry.name,
        kind: entry.kind ?? 'implant',
        slot: entry.slot,
        grades: [],
      };
      families.set(key, family);
    }
    family.grades.push({
      typeId: entry.typeId,
      code: parsed?.code ?? null,
      grade: parsed?.grade ?? null,
    });
  }
  for (const family of families.values()) {
    family.grades.sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0));
  }
  return [...families.values()];
}

/** Where an item goes: which kind of slot, and which one. */
export type SlotOf = (typeId: number) => { kind: ImplantKind; slot: number } | undefined;

/**
 * `set` with `typeId` added to its own kind of slot, replacing whatever of that
 * kind is already there — implant slot 3 and booster slot 3 are different slots.
 * A replaced booster takes its switched-on side effects with it.
 */
export function placeInSet(
  set: FittingImplantSet,
  slotOf: SlotOf,
  typeId: number
): FittingImplantSet {
  const place = slotOf(typeId);
  const sameSlot = (id: number) => {
    const other = slotOf(id);
    return place !== undefined && other?.kind === place.kind && other.slot === place.slot;
  };
  if (place?.kind === 'booster') {
    return withBoosters(set, [...set.boosters.filter((id) => !sameSlot(id)), typeId]);
  }
  return { ...set, implants: [...set.implants.filter((id) => !sameSlot(id)), typeId] };
}

/** `set` with each of `typeIds` placed in turn. */
export function placeAllInSet(
  set: FittingImplantSet,
  slotOf: SlotOf,
  typeIds: readonly number[]
): FittingImplantSet {
  return typeIds.reduce((next, id) => placeInSet(next, slotOf, id), set);
}

export type ImplantGoalId =
  | 'cpu'
  | 'powergrid'
  | 'capacitorCapacity'
  | 'capacitorRecharge'
  | 'turretDps'
  | 'missileDps'
  | 'droneDps'
  | 'fighterDps'
  | 'ehp'
  | 'repair'
  | 'speed'
  | 'agility'
  | 'lockRange'
  | 'scanResolution'
  | 'appliedDps'
  | 'weaponRange'
  | 'signatureRadius';

export interface Budget {
  used: number;
  total: number;
}

/** How a goal's figure is shown: decimals, and a divisor into the page's unit (ms → s, m → km). */
export interface GoalDisplay {
  decimals: number;
  divisor?: number;
}

/** What some goals are measured against: the Fitting page's selected Target Profile. */
export interface GoalContext {
  target?: TargetProfile;
}

/** Where a goal sits in the goal list. */
export type GoalGroup = 'fitting' | 'weapons' | 'tank' | 'navigation';

export type ImplantGoal = { id: ImplantGoalId; group: GoalGroup; display: GoalDisplay } & (
  | { kind: 'budget'; read: (stats: FittingStats) => Budget }
  | { kind: 'more' | 'less'; read: (stats: FittingStats, context: GoalContext) => number }
);

/** Peak applied DPS against `target` at any range — so an implant or booster that only improves application or reach still counts. */
const peakCache = new WeakMap<FittingStats, Map<TargetProfile, number>>();

function peakAppliedDps(stats: FittingStats, target: TargetProfile | undefined): number {
  if (!target || stats.applied.weapons.length === 0) return 0;
  // Screening reads the same baseline for every family it tries: work it out once.
  let byTarget = peakCache.get(stats);
  if (!byTarget) peakCache.set(stats, (byTarget = new Map()));
  let peak = byTarget.get(target);
  if (peak === undefined) {
    const maxRange = graphMaxRange([stats.applied]);
    peak = Math.max(0, ...appliedDpsVsRange(stats.applied, target, maxRange, 30).map((p) => p.dps));
    byTarget.set(target, peak);
  }
  return peak;
}

/** Raw DPS of one kind of weapon the Fitting fires. */
function weaponDps(stats: FittingStats, kind: AppliedWeapon['kind']): number {
  return stats.applied.weapons.reduce((sum, w) => (w.kind === kind ? sum + w.dps : sum), 0);
}

/** Metres: the longest turret optimal + falloff or missile flight among the firing weapons. */
function longestWeaponReach(stats: FittingStats): number {
  let reach = 0;
  for (const weapon of stats.applied.weapons) {
    if (weapon.kind === 'turret') reach = Math.max(reach, weapon.optimal + weapon.falloff);
    else if (weapon.kind === 'missile') reach = Math.max(reach, weapon.range);
  }
  return reach;
}

export const IMPLANT_GOALS: readonly ImplantGoal[] = [
  {
    id: 'cpu',
    group: 'fitting',
    kind: 'budget',
    display: { decimals: 1 },
    read: (s) => ({ used: s.cpuUsed, total: s.cpuTotal }),
  },
  {
    id: 'powergrid',
    group: 'fitting',
    kind: 'budget',
    display: { decimals: 1 },
    read: (s) => ({ used: s.powergridUsed, total: s.powergridTotal }),
  },
  {
    id: 'capacitorCapacity',
    group: 'fitting',
    kind: 'more',
    display: { decimals: 0 },
    read: (s) => s.capacitorCapacity,
  },
  // The engine's recharge time is in milliseconds; the page shows seconds.
  {
    id: 'capacitorRecharge',
    group: 'fitting',
    kind: 'less',
    display: { decimals: 1, divisor: 1000 },
    read: (s) => s.capacitorRechargeTime,
  },
  {
    id: 'turretDps',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => weaponDps(s, 'turret'),
  },
  {
    id: 'missileDps',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => weaponDps(s, 'missile'),
  },
  {
    id: 'droneDps',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => weaponDps(s, 'drone'),
  },
  {
    id: 'fighterDps',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => weaponDps(s, 'fighter'),
  },
  { id: 'ehp', group: 'tank', kind: 'more', display: { decimals: 0 }, read: (s) => s.ehp },
  {
    id: 'repair',
    group: 'tank',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => s.tank?.burstEffective ?? 0,
  },
  {
    id: 'speed',
    group: 'navigation',
    kind: 'more',
    display: { decimals: 0 },
    read: (s) => s.navigation.maxVelocity,
  },
  {
    id: 'agility',
    group: 'navigation',
    kind: 'less',
    display: { decimals: 3 },
    read: (s) => s.navigation.agility,
  },
  {
    id: 'lockRange',
    group: 'navigation',
    kind: 'more',
    display: { decimals: 1, divisor: 1000 },
    read: (s) => s.targeting.maxTargetRange,
  },
  {
    id: 'scanResolution',
    group: 'navigation',
    kind: 'more',
    display: { decimals: 0 },
    read: (s) => s.targeting.scanResolution,
  },
  {
    id: 'appliedDps',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1 },
    read: (s, context) => peakAppliedDps(s, context.target),
  },
  {
    id: 'weaponRange',
    group: 'weapons',
    kind: 'more',
    display: { decimals: 1, divisor: 1000 },
    read: (s) => longestWeaponReach(s),
  },
  {
    id: 'signatureRadius',
    group: 'tank',
    kind: 'less',
    display: { decimals: 0 },
    read: (s) => s.targeting.signatureRadius,
  },
];

/** A goal's figure in the unit the page shows it in. */
export function displayValue(
  goal: ImplantGoal,
  stats: FittingStats,
  context: GoalContext = {}
): number {
  const value = goal.kind === 'budget' ? goal.read(stats).used : goal.read(stats, context);
  return value / (goal.display.divisor ?? 1);
}

export function goalById(id: ImplantGoalId): ImplantGoal {
  const goal = IMPLANT_GOALS.find((g) => g.id === id);
  if (!goal) throw new Error(`unknown implant goal ${id}`);
  return goal;
}

/** What is left of a budget: negative when the fit is over. */
export function headroom(budget: Budget): number {
  return budget.total - budget.used;
}

/** CPU or powergrid still needed for the fit to fit; 0 when it already does. */
export function shortfall(budget: Budget): number {
  return Math.max(0, budget.used - budget.total);
}

/**
 * How far `after` moves the goal from `before`, as a share: freed headroom
 * over the total for a budget, the relative rise (or fall, for "less is
 * better") otherwise. Comparable across candidates for one goal only.
 */
export function goalGain(
  goal: ImplantGoal,
  before: FittingStats,
  after: FittingStats,
  context: GoalContext = {}
): number {
  if (goal.kind === 'budget') {
    const b = goal.read(before);
    const a = goal.read(after);
    return b.total > 0 ? (headroom(a) - headroom(b)) / b.total : 0;
  }
  const b = goal.read(before, context);
  const a = goal.read(after, context);
  if (b === 0) return 0;
  return goal.kind === 'more' ? (a - b) / Math.abs(b) : (b - a) / Math.abs(b);
}

/** Headroom an implant frees on a budget goal, in its own unit (tf, MW). */
export function headroomGain(goal: ImplantGoal, before: FittingStats, after: FittingStats): number {
  if (goal.kind !== 'budget') return 0;
  return headroom(goal.read(after)) - headroom(goal.read(before));
}

export interface HubPrice {
  hubId: string;
  /** Lowest sell order; null when nobody is selling. */
  sellMin: number | null;
  sellVolume: number;
}

export interface ImplantSource {
  hubId: string;
  price: number;
  volume: number;
  /** False when the pilot's hub has no sellers and this is the cheapest other one. */
  atSelectedHub: boolean;
}

/** Where to buy: the pilot's own hub when it has sellers, else the cheapest hub that does. */
export function pickSource(
  prices: readonly HubPrice[],
  selectedHubId: string
): ImplantSource | null {
  const here = prices.find((p) => p.hubId === selectedHubId);
  if (here && here.sellMin !== null) {
    return { hubId: here.hubId, price: here.sellMin, volume: here.sellVolume, atSelectedHub: true };
  }
  let best: ImplantSource | null = null;
  for (const p of prices) {
    if (p.hubId === selectedHubId || p.sellMin === null) continue;
    if (!best || p.sellMin < best.price) {
      best = { hubId: p.hubId, price: p.sellMin, volume: p.sellVolume, atSelectedHub: false };
    }
  }
  return best;
}

export interface FixCandidate {
  typeId: number;
  /** Which slot it takes — one item per key in a fix. */
  slot: number | string;
  /** Headroom this implant frees on its own, in the budget's unit. */
  headroomGain: number;
  /** NaN when it can't be bought anywhere. */
  price: number;
}

export interface FixOption {
  /** Lowest slot first. */
  typeIds: number[];
  cost: number;
  /** Summed per-implant gains — an estimate; the caller re-runs the fit to confirm. */
  headroomGain: number;
}

/**
 * Combinations of implants (one per slot) whose estimated headroom covers
 * `needed`, cheapest first. A grade that another in its slot beats on both
 * price and headroom is never used. The estimates sum each implant's own
 * gain, which stacking can sink, so the caller re-runs each option whole and
 * then thins the confirmed list with `keepMoreHeadroom`.
 */
export function cheapestFixes(
  candidates: readonly FixCandidate[],
  needed: number,
  limit = 4
): FixOption[] {
  const usable = candidates.filter((c) => Number.isFinite(c.price) && c.headroomGain > 0);
  const bySlot = new Map<number | string, FixCandidate[]>();
  for (const c of usable) {
    const beaten = usable.some(
      (o) =>
        o !== c &&
        o.slot === c.slot &&
        o.price <= c.price &&
        o.headroomGain >= c.headroomGain &&
        (o.price < c.price || o.headroomGain > c.headroomGain)
    );
    if (beaten) continue;
    const list = bySlot.get(c.slot) ?? [];
    list.push(c);
    bySlot.set(c.slot, list);
  }
  const slots = [...bySlot.keys()].sort((a, b) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const found: FixOption[] = [];
  const walk = (i: number, picks: FixCandidate[], cost: number, gain: number) => {
    if (i === slots.length) {
      if (picks.length > 0 && gain >= needed) {
        found.push({ typeIds: picks.map((p) => p.typeId), cost, headroomGain: gain });
      }
      return;
    }
    walk(i + 1, picks, cost, gain);
    for (const c of bySlot.get(slots[i]!)!) {
      walk(i + 1, [...picks, c], cost + c.price, gain + c.headroomGain);
    }
  };
  walk(0, [], 0, 0);
  found.sort((a, b) => a.cost - b.cost || b.headroomGain - a.headroomGain);
  return found.slice(0, limit);
}

/**
 * Cheapest first, keeping a dearer option only when it leaves more
 * headroom than every cheaper one — so each extra line buys something.
 */
export function keepMoreHeadroom<T extends { cost: number; headroom: number }>(
  options: readonly T[]
): T[] {
  const kept: T[] = [];
  let best = -Infinity;
  for (const option of [...options].sort((a, b) => a.cost - b.cost)) {
    if (option.headroom > best) {
      kept.push(option);
      best = option.headroom;
    }
  }
  return kept;
}
