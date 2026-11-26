import type { MiningYieldRow } from './yieldSnapshot';
import { sumVolume } from './volume';
import { sumUnits } from './oreBreakdown';
import type { ValueRanked } from './topTypes';

export interface DailyMetricPoint {
  date: string;
  value: number;
}

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
