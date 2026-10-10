/**
 * Price History region comparison: which regions are compared, and how their
 * daily averages line up against the primary region's days. Pure — the panel
 * fetches each region's history and hands the series in.
 */
import type { MarketHistoryPoint, MovingAveragePoint } from './priceHistory';

/**
 * One request per region per item view, and one more line per region on a
 * plot that already carries a band and two lines — four is where both stop
 * being cheap.
 */
export const MAX_COMPARE_REGIONS = 4;

/**
 * The comparison list as the chart should read it: the primary region is
 * already the main line, so it is dropped rather than drawn twice; repeats and
 * anything past the cap (a hand-edited URL) are dropped too. Pick order is
 * kept, because each region's colour and dash follow its slot.
 */
export function normalizeCompareRegions(
  regionIds: readonly number[],
  primaryRegionId: number
): number[] {
  const result: number[] = [];
  for (const id of regionIds) {
    if (id === primaryRegionId || result.includes(id)) continue;
    result.push(id);
    if (result.length === MAX_COMPARE_REGIONS) break;
  }
  return result;
}

/**
 * Picks or un-picks one region. A pick past the cap is ignored rather than
 * evicting an earlier choice — the reader decides which region to drop.
 */
export function toggleCompareRegion(regionIds: readonly number[], regionId: number): number[] {
  if (regionIds.includes(regionId)) return regionIds.filter((id) => id !== regionId);
  if (regionIds.length >= MAX_COMPARE_REGIONS) return [...regionIds];
  return [...regionIds, regionId];
}

export interface RegionAverageSeries {
  regionId: number;
  points: readonly MovingAveragePoint[];
}

export interface ComparedHistoryDay {
  date: string;
  /** Undefined on a day only a comparison region traded. */
  primary: MarketHistoryPoint | undefined;
  /** Each comparison region's average for the day, by region id; absent where that region did not trade. */
  averages: Readonly<Record<number, number>>;
}

/**
 * Joins the primary region's days with each comparison region's daily
 * average, over the union of their dates in ascending order. A union rather
 * than the primary's dates alone: a thinly traded item can trade in Domain on
 * a day it did not in The Forge, and dropping that day would bend Domain's
 * line through a point it never had.
 */
export function joinRegionAverages(
  primary: readonly MarketHistoryPoint[],
  comparisons: readonly RegionAverageSeries[]
): ComparedHistoryDay[] {
  const byDate = new Map<
    string,
    { primary: MarketHistoryPoint | undefined; averages: Record<number, number> }
  >();
  for (const p of primary) byDate.set(p.date, { primary: p, averages: {} });
  for (const series of comparisons) {
    for (const p of series.points) {
      let day = byDate.get(p.date);
      if (!day) {
        day = { primary: undefined, averages: {} };
        byDate.set(p.date, day);
      }
      day.averages[series.regionId] = p.average;
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, primary: day.primary, averages: day.averages }));
}
