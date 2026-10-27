import { DAY_MS } from '@/lib/age';
/**
 * Time-series arithmetic for the widget charts: the daily balance a journal
 * implies, and bucketing by week or hour. Pure and independent of the clock
 * (every function is handed `now`), so each is pinned by a plain test.
 */

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * One value per UTC day over the last `days` days ending at `today`, oldest
 * first. A day with no entry carries the previous day's balance forward; days
 * before the first known balance are left out (unknown is not zero), so the
 * series can be shorter than `days`.
 */
export function dailyBalanceSeries(
  byDay: ReadonlyMap<string, number>,
  today: string,
  days: number
): { days: string[]; values: number[] } {
  const windowStart = shiftDay(today, -(days - 1));
  let current: number | null = null;
  // The newest balance held before the window opens is where the window starts.
  const earlier = [...byDay.keys()].filter((day) => day < windowStart).sort();
  const lastEarlier = earlier[earlier.length - 1];
  if (lastEarlier !== undefined) current = byDay.get(lastEarlier) ?? null;
  const outDays: string[] = [];
  const values: number[] = [];
  for (let i = 0; i < days; i++) {
    const day = shiftDay(windowStart, i);
    const balance = byDay.get(day);
    if (balance !== undefined) current = balance;
    if (current !== null) {
      outDays.push(day);
      values.push(current);
    }
  }
  return { days: outDays, values };
}

/** The entries dated within the last `rangeDays` days of `now`. */
export function withinRange<T extends { date: string }>(
  entries: readonly T[],
  now: number,
  rangeDays: number
): T[] {
  const since = now - rangeDays * DAY_MS;
  return entries.filter((entry) => {
    const at = Date.parse(entry.date);
    return at >= since && at <= now;
  });
}

/** How many whole days back the oldest entry reaches; 0 for none. */
export function journalCoverageDays(entries: readonly { date: string }[], now: number): number {
  let oldest = Number.POSITIVE_INFINITY;
  for (const entry of entries) oldest = Math.min(oldest, Date.parse(entry.date));
  if (!Number.isFinite(oldest)) return 0;
  return Math.max(1, Math.ceil((now - oldest) / DAY_MS));
}

/**
 * Sums `valueOf` into `count` buckets of `bucketMs` that end at `now`, oldest
 * first. Anything older than the first bucket, or after `now`, is left out.
 */
export function backwardBucketSums<T>(
  items: readonly T[],
  atOf: (item: T) => number,
  valueOf: (item: T) => number,
  now: number,
  bucketMs: number,
  count: number
): number[] {
  const sums = Array<number>(count).fill(0);
  for (const item of items) {
    const age = now - atOf(item);
    if (age < 0 || age >= count * bucketMs) continue;
    sums[count - 1 - Math.floor(age / bucketMs)]! += valueOf(item);
  }
  return sums;
}
