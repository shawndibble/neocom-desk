/**
 * Mine more (an Improve Goal): mining yield carries no ore input, so the ore
 * enters only through the crystal. The pilot picks an ore; its crystal family
 * is loaded into every miner before each whole-fit calculation, the baseline's
 * too, so every row's m³/s is the same ore's. Pure.
 */
import { parseCrystal } from './crystalChoice';
import type { Fitting } from './types';

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
