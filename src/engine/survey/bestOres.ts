/**
 * The ores of a Survey ranked by what a cubic metre of them is worth: the
 * figure the Overview's Mining survey widget leads with. Pure — the scans and
 * the market prices arrive already read.
 */
import { priceScans } from './pricing';
import { summarizeSurvey, type SurveyScan } from './series';

export interface BestOre {
  ore: string;
  /** Market ISK in one m³ of the ore. */
  iskPerM3: number;
  /** m³ of it left in the latest scan. */
  volume: number;
  rocks: number;
}

/**
 * Ores still in the latest scan that have a market price, best ISK per m³ first.
 * An ore with no price, no rocks left or no volume has no honest figure and is left out.
 */
export function bestOres(
  scans: readonly SurveyScan[],
  unitPrices: ReadonlyMap<string, number>
): BestOre[] {
  const summary = summarizeSurvey(priceScans(scans, unitPrices), unitPrices);
  if (summary === null) return [];
  return summary.ores
    .filter((o) => o.volume > 0 && o.isk > 0)
    .map((o) => ({ ore: o.ore, iskPerM3: o.isk / o.volume, volume: o.volume, rocks: o.rocks }))
    .sort((a, b) => b.iskPerM3 - a.iskPerM3);
}
