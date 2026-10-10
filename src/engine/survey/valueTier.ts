/**
 * How rich each ore in a Survey is, as one of four tiers for the Survey tab's
 * ore bars: gray, blue, yellow, orange, richer left to right. Richness is the
 * ISK value of what is left per m³ of it (a miner is limited by cargo, so a
 * small rich ore beats a big poor one), judged against the richest ore on the
 * field, since what counts as rich moves with the market and the ore.
 */
import type { SurveyOre } from './series';

export type ValueTier = 'gray' | 'blue' | 'yellow' | 'orange';

/** Share of the richest ore's ISK/m³ an ore needs to reach each tier. */
const TIER_FLOORS: readonly [ValueTier, number][] = [
  ['orange', 0.9],
  ['yellow', 0.75],
  ['blue', 0.55],
];

/** ISK per m³ of what is left, or null with nothing left or no value to divide. */
export function valuePerM3(ore: Pick<SurveyOre, 'volume' | 'isk'>): number | null {
  return ore.volume > 0 && ore.isk > 0 ? ore.isk / ore.volume : null;
}

export function oreValueTiers(ores: readonly SurveyOre[]): Map<string, ValueTier> {
  const densities = ores.map((ore) => valuePerM3(ore));
  const best = Math.max(0, ...densities.map((d) => d ?? 0));
  return new Map(
    ores.map((ore, i) => {
      const density = densities[i];
      if (density === null || best === 0) return [ore.ore, 'gray'];
      const share = density / best;
      return [ore.ore, TIER_FLOORS.find(([, floor]) => share >= floor)?.[0] ?? 'gray'];
    })
  );
}

/**
 * Ores richest per m³ first (the order to mine them in), unpriced ores last, ties kept in order. An
 * ore's `iskPerM3` (its last known value) wins over what is left, so a mined-out ore keeps its place.
 */
export function sortByValuePerM3<
  T extends Pick<SurveyOre, 'volume' | 'isk'> & { iskPerM3?: number | null },
>(ores: readonly T[]): T[] {
  const key = (o: T): number => o.iskPerM3 ?? valuePerM3(o) ?? -1;
  return [...ores].sort((a, b) => key(b) - key(a));
}
