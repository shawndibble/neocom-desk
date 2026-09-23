/**
 * The Mining Yield Overview's date ranges (issue #1278). Every range counts
 * today as its first day, so "7d" is today and the six days before it. Works
 * on bare EVE/UTC date strings throughout — the ledger's own date format — so
 * no timezone ever shifts a day.
 */

export type MiningYieldRange = '90d' | '30d' | '7d' | 'today';

/** Widest first, the order the control lists them. No "All": history is kept 90 days, so it would always equal "90d". */
export const MINING_YIELD_RANGES: readonly MiningYieldRange[] = ['90d', '30d', '7d', 'today'];

const RANGE_DAYS: Record<MiningYieldRange, number> = { '90d': 90, '30d': 30, '7d': 7, today: 1 };

/** `date` shifted by `days` (negative = earlier), as a bare date string. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's EVE/UTC calendar date. */
export function eveToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function rangeDays(range: MiningYieldRange): number {
  return RANGE_DAYS[range];
}

/** First day inside `range`, inclusive. */
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

/** Every day of `range`, oldest first — the daily chart's full axis, days with no mining included. */
export function rangeDates(range: MiningYieldRange, today: string): string[] {
  const start = rangeStartDate(range, today);
  return Array.from({ length: RANGE_DAYS[range] }, (_, i) => shiftDate(start, i));
}

export interface DaysCovered {
  /** Distinct days in the range with any mining. */
  daysWithData: number;
  rangeDays: number;
  /**
   * The oldest saved day, when the range reaches back past it — the days
   * before it are empty because nothing was saved yet, not because nothing
   * was mined. Null when saved history covers the whole range, or nothing is
   * saved.
   */
  historyStartsInRange: string | null;
}

/** `dates` are the in-range rows' dates; `oldestSaved` is the oldest day held at all, in or out of range. */
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
