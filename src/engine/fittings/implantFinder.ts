/**
 * The implant finder's pure half: what an implant family is, which goals a
 * pilot can ask an implant to improve, how much a candidate moves a goal,
 * where to buy it, and which combinations fix an over-budget fit for the
 * least ISK. The engine runs and price fetches live in
 * `features/fittings/useImplantFinder.ts`.
 */
import type { FittingStats } from './types';

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

export interface ImplantEntry {
  typeId: number;
  name: string;
  slot: number;
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

const SLOT_GROUP = /^Implant Slot (\d+)$/;

/**
 * Every implant in the market tree, with its slot read from the "Implant
 * Slot NN" group it sits under — the baked SDE carries no slot attribute.
 * Boosters sit elsewhere in the tree and are left out.
 */
export function implantEntriesFromMarket(
  types: readonly MarketTypeLike[],
  groups: readonly MarketGroupLike[]
): ImplantEntry[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const slotOfGroup = new Map<number, number | null>();
  const resolve = (groupId: number): number | null => {
    if (slotOfGroup.has(groupId)) return slotOfGroup.get(groupId)!;
    const group = byId.get(groupId);
    const match = group ? SLOT_GROUP.exec(group.name) : null;
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

export interface ImplantGrade {
  typeId: number;
  /** `EE-605`; null for an implant sold in one version only. */
  code: string | null;
  grade: number | null;
}

/** Every grade of one implant — the same bonus at 1% to 6%, each its own item. */
export interface ImplantFamily {
  key: string;
  name: string;
  slot: number;
  /** Lowest grade first. */
  grades: ImplantGrade[];
}

export function groupImplantFamilies(entries: readonly ImplantEntry[]): ImplantFamily[] {
  const families = new Map<string, ImplantFamily>();
  for (const entry of entries) {
    const parsed = parseImplantGrade(entry.name);
    const key = parsed ? `${parsed.family} ${parsed.code.slice(0, -1)}` : entry.name;
    let family = families.get(key);
    if (!family) {
      family = { key, name: parsed?.family ?? entry.name, slot: entry.slot, grades: [] };
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

/**
 * `implants` with `typeId` added, replacing whatever already sits in its
 * slot — the game takes one implant per slot, and the engine doesn't check.
 */
export function withImplant(
  implants: readonly number[],
  slotOf: (typeId: number) => number | undefined,
  typeId: number
): number[] {
  const slot = slotOf(typeId);
  return [...implants.filter((id) => slot === undefined || slotOf(id) !== slot), typeId];
}

export type ImplantGoalId =
  | 'cpu'
  | 'powergrid'
  | 'capacitorCapacity'
  | 'capacitorRecharge'
  | 'damage'
  | 'ehp'
  | 'repair'
  | 'speed'
  | 'agility'
  | 'lockRange'
  | 'scanResolution';

export interface Budget {
  used: number;
  total: number;
}

export type ImplantGoal =
  | { id: ImplantGoalId; kind: 'budget'; read: (stats: FittingStats) => Budget }
  | { id: ImplantGoalId; kind: 'more' | 'less'; read: (stats: FittingStats) => number };

export const IMPLANT_GOALS: readonly ImplantGoal[] = [
  { id: 'cpu', kind: 'budget', read: (s) => ({ used: s.cpuUsed, total: s.cpuTotal }) },
  {
    id: 'powergrid',
    kind: 'budget',
    read: (s) => ({ used: s.powergridUsed, total: s.powergridTotal }),
  },
  { id: 'capacitorCapacity', kind: 'more', read: (s) => s.capacitorCapacity },
  { id: 'capacitorRecharge', kind: 'less', read: (s) => s.capacitorRechargeTime },
  { id: 'damage', kind: 'more', read: (s) => s.offense.dps },
  { id: 'ehp', kind: 'more', read: (s) => s.ehp },
  { id: 'repair', kind: 'more', read: (s) => s.tank?.burstEffective ?? 0 },
  { id: 'speed', kind: 'more', read: (s) => s.navigation.maxVelocity },
  { id: 'agility', kind: 'less', read: (s) => s.navigation.agility },
  { id: 'lockRange', kind: 'more', read: (s) => s.targeting.maxTargetRange },
  { id: 'scanResolution', kind: 'more', read: (s) => s.targeting.scanResolution },
];

export function goalById(id: ImplantGoalId): ImplantGoal {
  const goal = IMPLANT_GOALS.find((g) => g.id === id);
  if (!goal) throw new Error(`unknown implant goal ${id}`);
  return goal;
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
export function goalGain(goal: ImplantGoal, before: FittingStats, after: FittingStats): number {
  if (goal.kind === 'budget') {
    const b = goal.read(before);
    const a = goal.read(after);
    if (b.total <= 0) return 0;
    return (a.total - a.used - (b.total - b.used)) / b.total;
  }
  const b = goal.read(before);
  const a = goal.read(after);
  if (b === 0) return 0;
  return goal.kind === 'more' ? (a - b) / Math.abs(b) : (b - a) / Math.abs(b);
}

/** Headroom an implant frees on a budget goal, in its own unit (tf, MW). */
export function headroomGain(goal: ImplantGoal, before: FittingStats, after: FittingStats): number {
  if (goal.kind !== 'budget') return 0;
  const b = goal.read(before);
  const a = goal.read(after);
  return a.total - a.used - (b.total - b.used);
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
  slot: number;
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
 * Combinations of implants (one per slot) whose headroom covers
 * `needed`, cheapest first. A dearer option is kept only when it frees
 * more headroom than every cheaper one, so each extra line buys something.
 */
export function cheapestFixes(
  candidates: readonly FixCandidate[],
  needed: number,
  limit = 4
): FixOption[] {
  const bySlot = new Map<number, FixCandidate[]>();
  for (const c of candidates) {
    if (!Number.isFinite(c.price) || c.headroomGain <= 0) continue;
    const list = bySlot.get(c.slot) ?? [];
    list.push(c);
    bySlot.set(c.slot, list);
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
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
  const kept: FixOption[] = [];
  let bestGain = -Infinity;
  for (const option of found) {
    if (option.headroomGain > bestGain) {
      kept.push(option);
      bestGain = option.headroomGain;
    }
  }
  return kept.slice(0, limit);
}
