/**
 * The Charge Picker's arithmetic (the Add panel's Charges tab, and a weapon's
 * "Change charge" menu): every charge a weapon group takes, worked out for
 * the Fitting, then grouped by type (Iron … Antimatter, each with its
 * faction versions) or by faction, sorted, and rated for value.
 *
 * Pure: the figures on each `ChargeChoice` come from the dogma engine and
 * the hub's order book, gathered by `features/fittings/useChargeChoices`.
 */
import { turretDamageMultiplier, turretHitChance, type DamageSplit } from './appliedDps';

export type ChargeTier = 'tech1' | 'faction' | 'tech2';

export interface ChargeChoice {
  typeId: number;
  name: string;
  /** The Tech I charge a faction charge is a version of; its own id for any other. */
  baseTypeId: number;
  /** That Tech I charge's name — what its type group is called. */
  baseName: string;
  tier: ChargeTier;
  /** "Caldari Navy" for a faction charge; null for Tech I and Tech II. */
  faction: string | null;
  /** The whole weapon group's DPS with this charge loaded in every one of them. */
  dps: number;
  /** Metres. A missile's flight range, with `falloff` 0. */
  optimal: number;
  /** Metres. */
  falloff: number;
  damage: DamageSplit | null;
  /** ISK each at the Trade Hub; null when the hub has no sell order. */
  price: number | null;
  /**
   * Charges the whole group uses up per minute of nonstop fire; null for one
   * that doesn't wear out (a Tech I frequency crystal).
   */
  roundsPerMinute: number | null;
  /** How many the Fitting's cargo holds. */
  cargo: number;
  /** The pilot lacks a skill the charge needs: shown, but not loadable. */
  skillMissing: boolean;
}

export interface ChargeTypeGroup {
  baseTypeId: number;
  name: string;
  tier: 'tech1' | 'tech2';
  /** Tech I first, then faction versions by damage, then price. */
  choices: ChargeChoice[];
  /** The Tech I charge when it's listed, else the first choice: what the row's figures show. */
  representative: ChargeChoice;
}

export interface ChargeFactionGroup {
  /** `tech1`, `tech2`, or `faction:<name>`. */
  key: string;
  tier: ChargeTier;
  /** The faction's name; null for Tech I and Tech II. */
  faction: string | null;
  choices: ChargeChoice[];
  /** Median damage over the listed Tech I versions, minus 1; null without any. */
  damageGain: number | null;
  /** Median price over the listed Tech I versions; null without any priced pair. */
  priceRatio: number | null;
}

export type ChargeSort = 'range' | 'damage' | 'price';

export interface ChargeFilters {
  /** Drop faction charges (Tech II stays: it isn't a faction version of anything). */
  tech1Only: boolean;
  inCargo: boolean;
  /** Drop charges the pilot lacks a skill for. */
  usable: boolean;
}

export interface ChargeQuickPicks {
  maxDamage: ChargeChoice;
  maxRange: ChargeChoice;
  /** The cheapest per minute within `BEST_VALUE_SHARE` of the most damage; null when none is priced. */
  bestValue: ChargeChoice | null;
}

/** "Best value" looks at charges doing at least this share of the top damage. */
export const BEST_VALUE_SHARE = 0.9;
/** With a target distance set, a type landing under this share of the best is dimmed. */
export const WEAK_SHARE = 0.5;
/** A faction charge costing more than this many times its Tech I per minute is flagged. */
export const PRICEY_RATIO = 10;

/** A stationary, ship-sized target: range is the only thing taking damage off. */
const STILL_TARGET = { signatureRadius: 400, velocity: 0 } as const;

/** The faction prefix of a faction charge's name: what's ahead of its Tech I charge's name. */
export function factionName(name: string, baseName: string): string | null {
  if (name === baseName || !name.endsWith(` ${baseName}`)) return null;
  const prefix = name.slice(0, name.length - baseName.length).trim();
  return prefix === '' ? null : prefix;
}

/** "Antimatter" for "Antimatter Charge L": the size is the weapon's, and the same on every row. */
export function chargeLabel(name: string): string {
  return name.replace(/\s+Charge\s+(?:XL|[SML])$|\s+(?:XL|[SML])$/, '');
}

/** "Caldari Navy Antimatter": a quick pick's or the loaded line's name. */
export function chargeShortName(choice: ChargeChoice): string {
  const base = chargeLabel(choice.baseName);
  return choice.tier === 'faction' && choice.faction ? `${choice.faction} ${base}` : base;
}

/** DPS landing on a still target `distance` metres away: falloff for a turret, all-or-nothing for a missile. */
export function appliedDpsAt(choice: ChargeChoice, distance: number): number {
  if (choice.falloff <= 0) return distance > choice.optimal ? 0 : choice.dps;
  const weapon = {
    dps: choice.dps,
    optimal: choice.optimal,
    falloff: choice.falloff,
    tracking: 1,
    optimalSigRadius: 1,
  };
  // Capped at the listed DPS: the wrecking-shot average lifts a sure hit about
  // 1.5% over it, which would read as more damage than the row lists.
  const multiplier = turretDamageMultiplier(turretHitChance(weapon, STILL_TARGET, distance));
  return choice.dps * Math.min(1, multiplier);
}

/** Listed DPS, or what lands at `distance` when one is set. */
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

/** Cheapest first; an unknown price is never the cheapest. */
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
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
    const gain = median(damage);
    group.damageGain = gain === null ? null : gain - 1;
    group.priceRatio = median(price);
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
  return groups.slice().sort((a, b) => {
    const x = a.representative;
    const y = b.representative;
    if (sort === 'damage') return chargeScore(y, distance) - chargeScore(x, distance);
    if (sort === 'price') return comparePrice(x.price, y.price) || reach(y) - reach(x);
    return y.optimal - x.optimal || y.falloff - x.falloff || y.dps - x.dps;
  });
}

/** The same sort, for one faction group's charges. */
export function sortChoices(
  choices: readonly ChargeChoice[],
  sort: ChargeSort,
  distance: number | null
): ChargeChoice[] {
  return sortGroups(
    choices.map((c) => ({
      baseTypeId: c.typeId,
      name: c.name,
      tier: 'tech1' as const,
      choices: [c],
      representative: c,
    })),
    sort,
    distance
  ).map((g) => g.representative);
}

/** Whether the groups reach different distances — a missile group's all reach the same. */
export function rangesDiffer(groups: readonly ChargeTypeGroup[]): boolean {
  const reaches = groups.map((g) => reach(g.representative));
  if (reaches.length < 2) return false;
  return Math.max(...reaches) - Math.min(...reaches) > 1;
}

/**
 * A usable charge of the same type that does at least as much, reaches at
 * least as far, and costs less — so `choice` has no reason to be picked.
 * Null when there is none, or when `choice` has no price to compare.
 */
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
  /** Chance per shot that the crystal takes damage, 0–1. */
  volatility: number;
  /** HP it loses when it does. */
  volatilityDamage: number;
  hitpoints: number;
}

/**
 * Charges a weapon group uses up per minute of nonstop fire (reloads left
 * out): one per shot per gun for ammo and missiles; a frequency crystal's
 * expected wear for one that takes damage; null for one that never wears
 * out, or a weapon with no rate of fire.
 */
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
  const shots = (60_000 / rateOfFireMs) * guns;
  if (crystal === null) return shots;
  if (!crystal.takesDamage || crystal.hitpoints <= 0) return null;
  return (shots * crystal.volatility * crystal.volatilityDamage) / crystal.hitpoints;
}
