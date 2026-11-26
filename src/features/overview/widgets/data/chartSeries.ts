import { DAY_MS } from '@/lib/age';
import { shiftUtcDate } from '@/engine/localDay';

export function dailyBalanceSeries(
  byDay: ReadonlyMap<string, number>,
  today: string,
  days: number
): { days: string[]; values: number[] } {
  const windowStart = shiftUtcDate(today, -(days - 1));
  let current: number | null = null;
  const earlier = [...byDay.keys()].filter((day) => day < windowStart).sort();
  const lastEarlier = earlier[earlier.length - 1];
  if (lastEarlier !== undefined) current = byDay.get(lastEarlier) ?? null;
  const outDays: string[] = [];
  const values: number[] = [];
  for (let i = 0; i < days; i++) {
    const day = shiftUtcDate(windowStart, i);
    const balance = byDay.get(day);
    if (balance !== undefined) current = balance;
    if (current !== null) {
      outDays.push(day);
      values.push(current);
    }
  }
  return { days: outDays, values };
}

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

export function journalCoverageDays(entries: readonly { date: string }[], now: number): number {
  let oldest = Number.POSITIVE_INFINITY;
  for (const entry of entries) oldest = Math.min(oldest, Date.parse(entry.date));
  if (!Number.isFinite(oldest)) return 0;
  return Math.max(1, Math.ceil((now - oldest) / DAY_MS));
}

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
