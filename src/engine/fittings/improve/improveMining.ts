import { parseCrystal } from '../crystalChoice';
import type { ChargeLoadStep } from './improveCharges';
import type { ModuleAt } from '../fittingEdit';
import { isFiring } from '../stats';
import type { Fitting } from '../types';

export function crystalKeyOf(name: string): string | null {
  const crystal = parseCrystal(name);
  return crystal ? `${crystal.letter}${crystal.techLevel}` : null;
}

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

export function crystalParts(key: string): { letter: string; tier: 'I' | 'II' } {
  return { letter: key[0]!, tier: key[1] === '2' ? 'II' : 'I' };
}

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

export function minerWithoutCrystal(
  rows: readonly { typeId: number; isDrone: boolean; chargeTypeId?: number }[],
  crystalFor: (moduleTypeId: number) => number | null
): boolean {
  return rows.some((row) => !row.isDrone && (row.chargeTypeId ?? null) !== crystalFor(row.typeId));
}

export interface CrystalPlan {
  crystalFor: (moduleTypeId: number) => number | null;
  bestKey: string;
  crystalsOf: (moduleTypeId: number) => number[];
}

export interface CrystalSource {
  family: string;
  minerTypeIds: Iterable<number>;
  chargeGroupsOf: (moduleTypeId: number) => readonly number[];
  typeIdsInGroup: (groupId: number) => readonly number[];
  nameOf: (typeId: number) => string | undefined;
}

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
