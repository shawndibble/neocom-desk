/**
 * Mail list date sections: Today, Yesterday, This week,
 * Earlier this month, Last month, then one section per older month.
 *
 * Calendar days are read in the viewer's Time format zone (`undefined` =
 * device-local, `'UTC'` = EVE time), the same zone the rows print their date
 * in, so a mail never sits under a header its own date contradicts. Day math
 * runs on UTC day numbers built from that zone's calendar date, so DST shifts
 * can't move a boundary.
 */
import type { WeekStart } from '@/lib/calendarGrid';
import { DAY_MS } from '@/lib/age';

/** "Earlier this month" covers the start of this week back to the 1st. */
export type MailAgeBucket =
  | { kind: 'today' | 'yesterday' | 'thisWeek' | 'earlierThisMonth' | 'lastMonth' | 'undated' }
  | { kind: 'month'; year: number; month: number };

export interface MailAgeSection<T> {
  /** Stable per bucket, for React keys. */
  key: string;
  bucket: MailAgeBucket;
  items: T[];
}

const RANK = {
  today: 0,
  yesterday: 1,
  thisWeek: 2,
  earlierThisMonth: 3,
  lastMonth: 4,
  month: 5,
  undated: 6,
} as const;

interface CalendarDay {
  /** Days since the epoch, for the zone's calendar date. */
  day: number;
  /** year * 12 + zero-based month. */
  monthIndex: number;
}

function calendarDayReader(timeZone: string | undefined): (date: Date) => CalendarDay {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  return (date) => {
    let year = 0;
    let month = 0;
    let day = 0;
    for (const part of format.formatToParts(date)) {
      if (part.type === 'year') year = Number(part.value);
      else if (part.type === 'month') month = Number(part.value) - 1;
      else if (part.type === 'day') day = Number(part.value);
    }
    return { day: Date.UTC(year, month, day) / DAY_MS, monthIndex: year * 12 + month };
  };
}

function bucketKey(bucket: MailAgeBucket): string {
  return bucket.kind === 'month'
    ? `month-${bucket.year}-${String(bucket.month).padStart(2, '0')}`
    : bucket.kind;
}

/**
 * Groups `items` into date sections, newest section first. Items keep their
 * input order within a section, and each bucket appears at most once however
 * the input is ordered. A future timestamp (clock skew) counts as today; a
 * missing or unparseable one goes in a trailing `undated` section.
 */
export function groupMailByAge<T>(
  items: readonly T[],
  timestampOf: (item: T) => string | undefined,
  now: Date,
  timeZone: string | undefined,
  weekStart: WeekStart
): MailAgeSection<T>[] {
  const calendarDayOf = calendarDayReader(timeZone);
  const today = calendarDayOf(now);
  const weekday = new Date(today.day * DAY_MS).getUTCDay(); // 0 = Sunday
  const weekStartDay = today.day - ((weekday - (weekStart === 'sunday' ? 0 : 1) + 7) % 7);

  function bucketOf(timestamp: string | undefined): MailAgeBucket {
    const date = timestamp === undefined ? null : new Date(timestamp);
    if (date === null || Number.isNaN(date.getTime())) return { kind: 'undated' };
    const { day, monthIndex } = calendarDayOf(date);
    if (day >= today.day) return { kind: 'today' };
    if (day === today.day - 1) return { kind: 'yesterday' };
    if (day >= weekStartDay) return { kind: 'thisWeek' };
    if (monthIndex === today.monthIndex) return { kind: 'earlierThisMonth' };
    if (monthIndex === today.monthIndex - 1) return { kind: 'lastMonth' };
    return { kind: 'month', year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 };
  }

  const sections = new Map<string, MailAgeSection<T>>();
  for (const item of items) {
    const bucket = bucketOf(timestampOf(item));
    const key = bucketKey(bucket);
    const section = sections.get(key);
    if (section) section.items.push(item);
    else sections.set(key, { key, bucket, items: [item] });
  }

  const monthRecency = (bucket: MailAgeBucket): number =>
    bucket.kind === 'month' ? -(bucket.year * 12 + bucket.month) : 0;
  return [...sections.values()].sort(
    (a, b) =>
      RANK[a.bucket.kind] - RANK[b.bucket.kind] || monthRecency(a.bucket) - monthRecency(b.bucket)
  );
}
