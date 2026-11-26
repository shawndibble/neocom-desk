import { shiftUtcDate, utcDay } from '../localDay';

export type MiningYieldRange = '1y' | '90d' | '30d' | '7d' | 'today';

export const MINING_YIELD_RANGES: readonly MiningYieldRange[] = ['1y', '90d', '30d', '7d', 'today'];

const RANGE_DAYS: Record<MiningYieldRange, number> = {
  '1y': 365,
  '90d': 90,
  '30d': 30,
  '7d': 7,
  today: 1,
};

export const shiftDate = shiftUtcDate;

export function eveToday(now: Date): string {
  return utcDay(now.getTime());
}

export function rangeDays(range: MiningYieldRange): number {
  return RANGE_DAYS[range];
}

export function rangeStartDate(range: MiningYieldRange, today: string): string {
  return shiftDate(today, -(RANGE_DAYS[range] - 1));
}

export function filterYieldRange<T extends { date: string }>(
  items: readonly T[],
  range: MiningYieldRange,
  today: string
): T[] {
  const start = rangeStartDate(range, today);
  return items.filter((item) => item.date >= start && item.date <= today);
}

export function rangeDates(range: MiningYieldRange, today: string): string[] {
  const start = rangeStartDate(range, today);
  return Array.from({ length: RANGE_DAYS[range] }, (_, i) => shiftDate(start, i));
}

export interface DaysCovered {
  daysWithData: number;
  rangeDays: number;
  historyStartsInRange: string | null;
}

export function daysCovered(
  dates: readonly string[],
  range: MiningYieldRange,
  today: string,
  oldestSaved: string | null
): DaysCovered {
  const start = rangeStartDate(range, today);
  return {
    daysWithData: new Set(dates).size,
    rangeDays: RANGE_DAYS[range],
    historyStartsInRange: oldestSaved !== null && oldestSaved > start ? oldestSaved : null,
  };
}
