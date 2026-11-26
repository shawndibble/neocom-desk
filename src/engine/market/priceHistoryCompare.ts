import type { MarketHistoryPoint, MovingAveragePoint } from './priceHistory';

export const MAX_COMPARE_REGIONS = 4;

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
  primary: MarketHistoryPoint | undefined;
  averages: Readonly<Record<number, number>>;
}

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
