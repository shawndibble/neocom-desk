import {
  appliedDpsVsRange,
  graphMaxRange,
  sustainedInputs,
  type AppliedWeapon,
} from './appliedDps';
import type { TargetProfile } from './targetProfile';
import { withBoosters } from './boosterSideEffects';
import type { FittingImplantSet, FittingStats } from './types';

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

export type ImplantKind = 'implant' | 'booster';

export interface ImplantEntry {
  typeId: number;
  name: string;
  slot: number;
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

export function implantEntriesFromMarket(
  types: readonly MarketTypeLike[],
  groups: readonly MarketGroupLike[]
): ImplantEntry[] {
  return entriesUnderSlotGroups(types, groups, /^Implant Slot (\d+)$/);
}

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
  code: string | null;
  grade: number | null;
}

export interface ImplantFamily {
  key: string;
  name: string;
  kind: ImplantKind;
  slot: number;
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

export type SlotOf = (typeId: number) => { kind: ImplantKind; slot: number } | undefined;

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
  | 'signatureRadius'
  | 'miningYield'
  | 'warpSpeed'
  | 'sensorStrength';

export interface Budget {
  used: number;
  total: number;
}

export interface GoalDisplay {
  decimals: number;
  divisor?: number;
}

export interface GoalContext {
  target?: TargetProfile;
}

export type GoalGroup = 'fitting' | 'weapons' | 'mining' | 'tank' | 'navigation';

export type ImplantGoal = { id: ImplantGoalId; group: GoalGroup; display: GoalDisplay } & (
  | { kind: 'budget'; read: (stats: FittingStats) => Budget }
  | { kind: 'more' | 'less'; read: (stats: FittingStats, context: GoalContext) => number }
);

const peakCache = new WeakMap<FittingStats, Map<TargetProfile, number>>();

export function peakAppliedDps(stats: FittingStats, target: TargetProfile | undefined): number {
  if (!target || stats.applied.weapons.length === 0) return 0;
  let byTarget = peakCache.get(stats);
  if (!byTarget) peakCache.set(stats, (byTarget = new Map()));
  let peak = byTarget.get(target);
  if (peak === undefined) {
    const maxRange = graphMaxRange([stats.applied]);
    const sustained = sustainedInputs(stats.applied);
    peak = Math.max(0, ...appliedDpsVsRange(sustained, target, maxRange, 30).map((p) => p.dps));
    byTarget.set(target, peak);
  }
  return peak;
}

function weaponDps(stats: FittingStats, kind: AppliedWeapon['kind']): number {
  return stats.applied.weapons.reduce((sum, w) => (w.kind === kind ? sum + w.dps : sum), 0);
}

function longestWeaponReach(stats: FittingStats): number {
  let reach = 0;
  for (const weapon of stats.applied.weapons) {
    if (weapon.kind === 'turret') reach = Math.max(reach, weapon.optimal + weapon.falloff);
    else if (weapon.kind === 'missile' || weapon.kind === 'area')
      reach = Math.max(reach, weapon.range);
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
  {
    id: 'miningYield',
    group: 'mining',
    kind: 'more',
    display: { decimals: 0 },
    read: (s) => s.mining.perHour,
  },
  {
    id: 'warpSpeed',
    group: 'navigation',
    kind: 'more',
    display: { decimals: 2 },
    read: (s) => s.navigation.warpSpeed,
  },
  {
    id: 'sensorStrength',
    group: 'tank',
    kind: 'more',
    display: { decimals: 1 },
    read: (s) => s.sensor.strength,
  },
];

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

export function headroom(budget: Budget): number {
  return budget.total - budget.used;
}

export function shortfall(budget: Budget): number {
  return Math.max(0, budget.used - budget.total);
}

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

export function headroomGain(goal: ImplantGoal, before: FittingStats, after: FittingStats): number {
  if (goal.kind !== 'budget') return 0;
  return headroom(goal.read(after)) - headroom(goal.read(before));
}

export interface HubPrice {
  hubId: string;
  sellMin: number | null;
  sellVolume: number;
}

export interface ImplantSource {
  hubId: string;
  price: number;
  volume: number;
  atSelectedHub: boolean;
}

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
  slot: number | string;
  headroomGain: number;
  price: number;
}

export interface FixOption {
  typeIds: number[];
  cost: number;
  headroomGain: number;
}

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
