/**
 * How dear each ore in a Survey is, as one of four tiers for the Survey tab's
 * ore bars: gray, blue, yellow, orange, dearer left to right. Dearness is the
 * market price of one unit of the ore, placed between the cheapest and the
 * dearest ore on the field, so the dearest is always orange and the cheapest
 * always gray (an ore with no price is gray), whatever the market is doing.
 */
import type { SurveyOre } from './series';

export type ValueTier = 'gray' | 'blue' | 'yellow' | 'orange';

/** How far up the cheapest-to-dearest range an ore needs to be to reach each tier. */
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
      // One price on the field, or all alike: the dearest there is.
      if (best === worst) return [ore.ore, 'orange'];
      const share = (ore.unitPrice - worst) / (best - worst);
      return [ore.ore, TIER_FLOORS.find(([, floor]) => share >= floor)?.[0] ?? 'gray'];
    })
  );
}
