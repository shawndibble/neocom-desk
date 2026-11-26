import type { SurveyOre } from './series';

export type ValueTier = 'gray' | 'blue' | 'yellow' | 'orange';

const TIER_FLOORS: readonly [ValueTier, number][] = [
  ['orange', 0.75],
  ['yellow', 0.5],
  ['blue', 0.25],
];

export function oreValueTiers(
  ores: readonly Pick<SurveyOre, 'ore' | 'unitPrice'>[]
): Map<string, ValueTier> {
  const prices = ores.flatMap((o) => (o.unitPrice === null ? [] : [o.unitPrice]));
  const best = Math.max(0, ...prices);
  const worst = Math.min(best, ...prices);
  return new Map(
    ores.map((ore) => {
      if (ore.unitPrice === null) return [ore.ore, 'gray'];
      if (best === worst) return [ore.ore, 'orange'];
      const share = (ore.unitPrice - worst) / (best - worst);
      return [ore.ore, TIER_FLOORS.find(([, floor]) => share >= floor)?.[0] ?? 'gray'];
    })
  );
}
