/**
 * Mine more (an Improve Goal): mining yield carries no ore input, so the ore
 * enters only through the crystal. The pilot picks an ore; its crystal family
 * is loaded into every miner before each whole-fit calculation, the baseline's
 * too, so every row's m³/s is the same ore's. Pure.
 */
import { parseCrystal } from '../crystalChoice';
import type { ChargeLoadStep } from './improveCharges';
import type { ModuleAt } from '../fittingEdit';
import { isFiring } from '../stats';
import type { Fitting } from '../types';

/** "A2" for a Type A II crystal; null for a charge that is not a mining crystal. */
export function crystalKeyOf(name: string): string | null {
  const crystal = parseCrystal(name);
  return crystal ? `${crystal.letter}${crystal.techLevel}` : null;
}

/** The type ids among `typeIds` that are `family` mining crystals. */
export function crystalsOfFamily(
  family: string,
  typeIds: readonly number[],
  nameOf: (typeId: number) => string | undefined
): number[] {
  return typeIds.filter((typeId) => {
    const name = nameOf(typeId);
    return name !== undefined && parseCrystal(name)?.family === family;
  });
}

/**
 * `fitting` with `crystalFor(module type)` loaded in every module it names;
 * a null leaves that module's own charge. The miners' own ore is replaced,
 * so two fits compare on the one ore the pilot asked about.
 */
export function loadCrystals(
  fitting: Fitting,
  crystalFor: (moduleTypeId: number) => number | null
): Fitting {
  return {
    ...fitting,
    modules: fitting.modules.map((module) => {
      const crystal = crystalFor(module.typeId);
      return crystal === null ? module : { ...module, chargeTypeId: crystal };
    }),
  };
}

/** The crystal key (`crystalKeyOf`) with the best m³/s under `yieldOf`; null with no keys. */
export async function bestCrystalKey(
  keys: readonly string[],
  yieldOf: (key: string) => Promise<number>
): Promise<string | null> {
  let best: { key: string; perSecond: number } | null = null;
  for (const key of keys) {
    const perSecond = await yieldOf(key);
    if (best === null || perSecond > best.perSecond) best = { key, perSecond };
  }
  return best?.key ?? null;
}

/** The letter and tier of a crystal key: "B2" is B, II. */
export function crystalParts(key: string): { letter: string; tier: 'I' | 'II' } {
  return { letter: key[0]!, tier: key[1] === '2' ? 'II' : 'I' };
}

/**
 * Active miners that take a crystal of the picked ore but hold none of it
 * (empty, or another ore's), and the loads that fix them with `crystalFor`'s
 * crystal. Null when there are none.
 */
export function unloadedMiners(
  fitting: Fitting,
  crystalsOf: (moduleTypeId: number) => readonly number[],
  crystalFor: (moduleTypeId: number) => number | null
): { count: number; steps: ChargeLoadStep[] } | null {
  const byCrystal = new Map<number, ModuleAt[]>();
  let count = 0;
  for (const module of fitting.modules) {
    if (!isFiring(module.state)) continue;
    const takes = crystalsOf(module.typeId);
    if (
      takes.length === 0 ||
      (module.chargeTypeId !== undefined && takes.includes(module.chargeTypeId))
    )
      continue;
    const crystal = crystalFor(module.typeId);
    if (crystal === null) continue;
    count++;
    const at = byCrystal.get(crystal) ?? [];
    at.push({ slot: module.slot, slotIndex: module.slotIndex });
    byCrystal.set(crystal, at);
  }
  if (count === 0) return null;
  return {
    count,
    steps: [...byCrystal].map(([chargeTypeId, at]) => ({ chargeTypeId, fromCargo: false, at })),
  };
}

/**
 * Whether a miner in the calculation does not hold the plan's crystal, so it
 * would mine another ore's m³/s. A miner the plan gives no crystal (it takes
 * none) holds none: its charge is `undefined`, the plan's answer `null`.
 */
export function minerWithoutCrystal(
  rows: readonly { typeId: number; isDrone: boolean; chargeTypeId?: number }[],
  crystalFor: (moduleTypeId: number) => number | null
): boolean {
  return rows.some((row) => !row.isDrone && (row.chargeTypeId ?? null) !== crystalFor(row.typeId));
}

/** Mine more's ore plan: what each miner loads, the best crystal's key, and which crystals each miner type takes. */
export interface CrystalPlan {
  crystalFor: (moduleTypeId: number) => number | null;
  bestKey: string;
  crystalsOf: (moduleTypeId: number) => number[];
}

/** What `crystalPlan` reads of the fit and the type catalogue. */
export interface CrystalSource {
  /** The ore's crystal family. */
  family: string;
  /** The fitted miners' type ids (not drones). */
  minerTypeIds: Iterable<number>;
  /** The charge groups a module type takes on this hull; none for a module that takes no charge. */
  chargeGroupsOf: (moduleTypeId: number) => readonly number[];
  typeIdsInGroup: (groupId: number) => readonly number[];
  nameOf: (typeId: number) => string | undefined;
}

/**
 * Mine more's ore: which crystal each miner type loads, for the family. The
 * crystal letter and tech level that `yieldOf` scores best (the open Fitting's
 * m³/s with every miner loaded so) is used for every miner type, so each row
 * is the one ore's best case. Null when no fitted miner takes a crystal of the family.
 */
export async function crystalPlan(
  source: CrystalSource,
  yieldOf: (crystalFor: (moduleTypeId: number) => number | null) => Promise<number>
): Promise<CrystalPlan | null> {
  const { family, nameOf } = source;
  const known = new Map<number, number[]>();
  const crystalsOf = (typeId: number): number[] => {
    let crystals = known.get(typeId);
    if (!crystals) {
      crystals = crystalsOfFamily(
        family,
        source.chargeGroupsOf(typeId).flatMap((group) => source.typeIdsInGroup(group)),
        nameOf
      );
      known.set(typeId, crystals);
    }
    return crystals;
  };
  const keyOf = (crystal: number) => crystalKeyOf(nameOf(crystal) ?? '');
  const forKey = (key: string) => (typeId: number) =>
    crystalsOf(typeId).find((crystal) => keyOf(crystal) === key) ?? null;
  const keys = new Set<string>();
  for (const typeId of new Set(source.minerTypeIds))
    for (const crystal of crystalsOf(typeId)) {
      const key = keyOf(crystal);
      if (key) keys.add(key);
    }
  const best = await bestCrystalKey([...keys], (key) => yieldOf(forKey(key)));
  return best === null ? null : { crystalFor: forKey(best), bestKey: best, crystalsOf };
}
