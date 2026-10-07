/**
 * Pure per-day and per-type folding for the Mining Yield Overview's m³ and
 * Count chart metrics (issue #2160). The ISK metric's own dailyRate/
 * typeComparison aggregation stays inline in `OverviewTab.tsx` — these mirror
 * only the two new metrics, reusing `sumVolume`/`sumUnits`'s row-level logic.
 * A day or type mixing known- and unknown-volume ore renders its known total;
 * a day or type with nothing known renders as a real 0 — never omitted, and
 * never a false zero standing in for a day/type that wasn't mined at all.
 */
import type { MiningYieldRow } from './yieldSnapshot';
import { sumVolume } from './volume';
import { sumUnits } from './oreBreakdown';
import type { ValueRanked } from './topTypes';

export interface DailyMetricPoint {
  date: string;
  value: number;
}

/**
 * One point per day in `dates`, each day's known m³ total. The ledger has no
 * time of day, so no honest per-hour figure exists (see the range's decision
 * doc). A day mixing known- and
 * unknown-volume lines sums only the known ones; a day with none known reads
 * as a true 0, not a hidden bar.
 */
export function dailyVolumePoints(
  rows: readonly MiningYieldRow[],
  dates: readonly string[],
  typeVolumes: ReadonlyMap<number, number>
): DailyMetricPoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const { m3 } = sumVolume(
      row.entry.oreLines,
      (line) => line.typeId,
      (line) => line.quantity,
      typeVolumes
    );
    byDate.set(row.entry.date, (byDate.get(row.entry.date) ?? 0) + m3);
  }
  return dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
}

/** Same per-day total as `dailyVolumePoints`, for item quantity instead of m³. */
export function dailyCountPoints(
  rows: readonly MiningYieldRow[],
  dates: readonly string[]
): DailyMetricPoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(row.entry.date, (byDate.get(row.entry.date) ?? 0) + sumUnits(row.entry.oreLines));
  }
  return dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
}

/**
 * Total m³ per ore type across every row. A type with no known unit volume at
 * all still gets a bar — at 0, same as the daily chart's own "nothing known"
 * case — rather than disappearing from the chart entirely.
 */
export function typeVolumeComparison(
  rows: readonly MiningYieldRow[],
  typeNames: ReadonlyMap<number, string>,
  typeVolumes: ReadonlyMap<number, number>
): ValueRanked[] {
  const byType = new Map<number, number>();
  for (const row of rows) {
    for (const line of row.entry.oreLines) {
      const unit = typeVolumes.get(line.typeId) ?? 0;
      byType.set(line.typeId, (byType.get(line.typeId) ?? 0) + unit * line.quantity);
    }
  }
  return [...byType.entries()].map(([typeId, value]) => ({
    typeId,
    typeName: typeNames.get(typeId) ?? `#${typeId}`,
    value,
  }));
}

/** Total item quantity per ore type across every row, matching the table's own `sumUnits` totals. */
export function typeCountComparison(
  rows: readonly MiningYieldRow[],
  typeNames: ReadonlyMap<number, string>
): ValueRanked[] {
  const byType = new Map<number, number>();
  for (const row of rows) {
    for (const line of row.entry.oreLines) {
      byType.set(line.typeId, (byType.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  return [...byType.entries()].map(([typeId, value]) => ({
    typeId,
    typeName: typeNames.get(typeId) ?? `#${typeId}`,
    value,
  }));
}
