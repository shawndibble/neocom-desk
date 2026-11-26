import { median } from '../math';
import { turretDamageMultiplier, turretHitChance, type DamageSplit } from './appliedDps';
import type { CapBoosterFigures } from './capBoosterChoice';
import type { CrystalFigures } from './mining';
import { MINUTE_MS } from '@/lib/age';

export type ChargeTier = 'tech1' | 'faction' | 'tech2';

export interface ChargeChoice {
  typeId: number;
  name: string;
  baseTypeId: number;
  baseName: string;
  tier: ChargeTier;
  faction: string | null;
  dps: number;
  optimal: number;
  falloff: number;
  damage: DamageSplit | null;
  price: number | null;
  roundsPerMinute: number | null;
  cargo: number;
  skillMissing: boolean;
  cap?: CapBoosterFigures;
  mining?: CrystalFigures;
}

export interface ChargeTypeGroup {
  baseTypeId: number;
  name: string;
  tier: 'tech1' | 'tech2';
  choices: ChargeChoice[];
  representative: ChargeChoice;
}

export interface ChargeFactionGroup {
  key: string;
  tier: ChargeTier;
  faction: string | null;
  choices: ChargeChoice[];
  damageGain: number | null;
  priceRatio: number | null;
}

export type ChargeSort = 'range' | 'damage' | 'price';

export interface ChargeFilters {
  tech1Only: boolean;
  inCargo: boolean;
  usable: boolean;
}

export interface ChargeQuickPicks {
  maxDamage: ChargeChoice;
  maxRange: ChargeChoice;
  bestValue: ChargeChoice | null;
}

export const BEST_VALUE_SHARE = 0.9;
export const PRICEY_RATIO = 10;

const STILL_TARGET = { signatureRadius: 400, velocity: 0 } as const;

export function factionName(name: string, baseName: string): string | null {
  if (name === baseName || !name.endsWith(` ${baseName}`)) return null;
  const prefix = name.slice(0, name.length - baseName.length).trim();
  return prefix === '' ? null : prefix;
}

export function chargeLabel(name: string): string {
  return name.replace(/\s+Charge\s+(?:XL|[SML])$|\s+(?:XL|[SML])$/, '');
}

export function chargeShortName(choice: ChargeChoice): string {
  const base = chargeLabel(choice.baseName);
  return choice.tier === 'faction' && choice.faction ? `${choice.faction} ${base}` : base;
}

export function appliedDpsAt(choice: ChargeChoice, distance: number): number {
  if (choice.falloff <= 0) return distance > choice.optimal ? 0 : choice.dps;
  const weapon = {
    dps: choice.dps,
    optimal: choice.optimal,
    falloff: choice.falloff,
    tracking: 1,
    optimalSigRadius: 1,
  };
  const multiplier = turretDamageMultiplier(turretHitChance(weapon, STILL_TARGET, distance));
  return choice.dps * Math.min(1, multiplier);
}

export function chargeScore(choice: ChargeChoice, distance: number | null): number {
  return distance === null ? choice.dps : appliedDpsAt(choice, distance);
}

export function reach(choice: ChargeChoice): number {
  return choice.optimal + choice.falloff;
}

export function iskPerMinute(choice: ChargeChoice): number | null {
  if (choice.price === null || choice.roundsPerMinute === null) return null;
  return choice.price * choice.roundsPerMinute;
}

function comparePrice(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
}

function byDamageThenPrice(a: ChargeChoice, b: ChargeChoice): number {
  return b.dps - a.dps || comparePrice(a.price, b.price) || a.name.localeCompare(b.name);
}

const TIER_ORDER: Record<ChargeTier, number> = { tech1: 0, faction: 1, tech2: 2 };

export function groupByType(choices: readonly ChargeChoice[]): ChargeTypeGroup[] {
  const byBase = new Map<number, ChargeChoice[]>();
  for (const c of choices) {
    const list = byBase.get(c.baseTypeId) ?? [];
    list.push(c);
    byBase.set(c.baseTypeId, list);
  }
  const groups = [...byBase.entries()].map(([baseTypeId, list]): ChargeTypeGroup => {
    const sorted = list
      .slice()
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || byDamageThenPrice(a, b));
    const representative = sorted[0]!;
    return {
      baseTypeId,
      name: representative.baseName,
      tier: representative.tier === 'tech2' ? 'tech2' : 'tech1',
      choices: sorted,
      representative,
    };
  });
  return groups.sort(
    (a, b) =>
      (a.tier === 'tech2' ? 1 : 0) - (b.tier === 'tech2' ? 1 : 0) ||
      reach(b.representative) - reach(a.representative) ||
      a.name.localeCompare(b.name)
  );
}

function medianOrNull(values: number[]): number | null {
  return values.length === 0 ? null : median(values);
}

export function groupByFaction(choices: readonly ChargeChoice[]): ChargeFactionGroup[] {
  const tech1ById = new Map(choices.filter((c) => c.tier === 'tech1').map((c) => [c.typeId, c]));
  const groups = new Map<string, ChargeFactionGroup>();
  for (const c of choices) {
    const key = c.tier === 'faction' ? `faction:${c.faction ?? c.name}` : c.tier;
    const group = groups.get(key) ?? {
      key,
      tier: c.tier,
      faction: c.tier === 'faction' ? (c.faction ?? c.name) : null,
      choices: [],
      damageGain: null,
      priceRatio: null,
    };
    group.choices.push(c);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.tier !== 'faction') continue;
    const damage: number[] = [];
    const price: number[] = [];
    for (const c of group.choices) {
      const base = tech1ById.get(c.baseTypeId);
      if (!base) continue;
      if (base.dps > 0) damage.push(c.dps / base.dps);
      if (base.price && c.price !== null) price.push(c.price / base.price);
    }
    const gain = medianOrNull(damage);
    group.damageGain = gain === null ? null : gain - 1;
    group.priceRatio = medianOrNull(price);
  }
  return [...groups.values()].sort(
    (a, b) =>
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      (a.damageGain ?? 0) - (b.damageGain ?? 0) ||
      comparePrice(a.priceRatio, b.priceRatio) ||
      a.key.localeCompare(b.key)
  );
}

export function sortGroups(
  groups: readonly ChargeTypeGroup[],
  sort: ChargeSort,
  distance: number | null
): ChargeTypeGroup[] {
  const compare = chargeComparator(sort, distance);
  return groups.slice().sort((a, b) => compare(a.representative, b.representative));
}

export function sortChoices(
  choices: readonly ChargeChoice[],
  sort: ChargeSort,
  distance: number | null
): ChargeChoice[] {
  return choices.slice().sort(chargeComparator(sort, distance));
}

function chargeComparator(sort: ChargeSort, distance: number | null) {
  return (x: ChargeChoice, y: ChargeChoice): number => {
    if (sort === 'damage') return chargeScore(y, distance) - chargeScore(x, distance);
    if (sort === 'price') return comparePrice(x.price, y.price) || reach(y) - reach(x);
    return y.optimal - x.optimal || y.falloff - x.falloff || y.dps - x.dps;
  };
}

export function rangesDiffer(groups: readonly ChargeTypeGroup[]): boolean {
  const reaches = groups.map((g) => reach(g.representative));
  if (reaches.length < 2) return false;
  return Math.max(...reaches) - Math.min(...reaches) > 1;
}

export function strictlyWorseThan(
  choice: ChargeChoice,
  all: readonly ChargeChoice[]
): ChargeChoice | null {
  if (choice.price === null) return null;
  const price = choice.price;
  return (
    all.find(
      (other) =>
        other !== choice &&
        other.typeId !== choice.typeId &&
        other.baseTypeId === choice.baseTypeId &&
        !other.skillMissing &&
        other.price !== null &&
        other.price < price &&
        other.dps >= choice.dps &&
        other.optimal >= choice.optimal &&
        other.falloff >= choice.falloff
    ) ?? null
  );
}

export function quickPicks(
  choices: readonly ChargeChoice[],
  distance: number | null
): ChargeQuickPicks | null {
  const usable = choices.filter((c) => !c.skillMissing);
  if (usable.length === 0) return null;
  const score = (c: ChargeChoice) => chargeScore(c, distance);
  const cheaper = (a: ChargeChoice, b: ChargeChoice) =>
    comparePrice(iskPerMinute(a) ?? a.price, iskPerMinute(b) ?? b.price) < 0;
  const maxDamage = usable.reduce((best, c) =>
    score(c) > score(best) || (score(c) === score(best) && cheaper(c, best)) ? c : best
  );
  const maxRange = usable.reduce((best, c) =>
    reach(c) > reach(best) || (reach(c) === reach(best) && score(c) > score(best)) ? c : best
  );
  const top = score(maxDamage);
  const priced = usable.filter((c) => c.price !== null && score(c) >= top * BEST_VALUE_SHARE);
  const bestValue = priced.length
    ? priced.reduce((best, c) => (cheaper(c, best) ? c : best))
    : null;
  return { maxDamage, maxRange, bestValue };
}

export function filterChoices(
  choices: readonly ChargeChoice[],
  filters: ChargeFilters
): ChargeChoice[] {
  return choices.filter(
    (c) =>
      (!filters.tech1Only || c.tier !== 'faction') &&
      (!filters.inCargo || c.cargo > 0) &&
      (!filters.usable || !c.skillMissing)
  );
}

export interface CrystalWear {
  takesDamage: boolean;
  volatility: number;
  volatilityDamage: number;
  hitpoints: number;
}

export function chargesUsedPerMinute({
  rateOfFireMs,
  guns,
  crystal,
}: {
  rateOfFireMs: number;
  guns: number;
  crystal: CrystalWear | null;
}): number | null {
  if (rateOfFireMs <= 0) return null;
  const shots = (MINUTE_MS / rateOfFireMs) * guns;
  if (crystal === null) return shots;
  if (!crystal.takesDamage || crystal.hitpoints <= 0) return null;
  return (shots * crystal.volatility * crystal.volatilityDamage) / crystal.hitpoints;
}
