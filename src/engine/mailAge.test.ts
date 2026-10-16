import { describe, it, expect } from 'vitest';
import { groupMailByAge, type MailAgeBucket } from './mailAge';

interface Item {
  id: string;
  timestamp?: string;
}

function item(id: string, timestamp?: string): Item {
  return { id, timestamp };
}

function group(
  items: readonly Item[],
  now: string,
  timeZone: string | undefined = 'UTC',
  weekStart: 'monday' | 'sunday' = 'monday'
) {
  return groupMailByAge(items, (i) => i.timestamp, new Date(now), timeZone, weekStart);
}

/** Bucket of each item id, so one assertion reads every placement at once. */
function bucketsById(
  items: readonly Item[],
  now: string,
  timeZone?: string,
  weekStart?: 'monday' | 'sunday'
): Record<string, MailAgeBucket> {
  const out: Record<string, MailAgeBucket> = {};
  for (const section of group(items, now, timeZone, weekStart))
    for (const i of section.items) out[i.id] = section.bucket;
  return out;
}

// 2026-10-16 is a Friday.
const FRIDAY_NOON = '2026-10-16T12:00:00Z';

describe('groupMailByAge', () => {
  it('splits Today from Yesterday at the local midnight', () => {
    expect(
      bucketsById(
        [item('justAfter', '2026-10-16T00:00:00Z'), item('justBefore', '2026-10-15T23:59:59Z')],
        '2026-10-16T00:00:30Z'
      )
    ).toEqual({ justAfter: { kind: 'today' }, justBefore: { kind: 'yesterday' } });
  });

  it('puts the rest of a Monday-start week under This week, and the days before it under Earlier this month', () => {
    expect(
      bucketsById(
        [
          item('wed', '2026-10-14T08:00:00Z'),
          item('mon', '2026-10-12T00:00:00Z'),
          item('sun', '2026-10-11T23:00:00Z'),
        ],
        FRIDAY_NOON
      )
    ).toEqual({
      wed: { kind: 'thisWeek' },
      mon: { kind: 'thisWeek' },
      sun: { kind: 'earlierThisMonth' },
    });
  });

  it('starts the week on Sunday when the pilot chose Sunday', () => {
    expect(
      bucketsById(
        [item('sun', '2026-10-11T00:00:00Z'), item('sat', '2026-10-10T23:00:00Z')],
        FRIDAY_NOON,
        'UTC',
        'sunday'
      )
    ).toEqual({ sun: { kind: 'thisWeek' }, sat: { kind: 'earlierThisMonth' } });
  });

  it('keeps Yesterday ahead of last week when today is the first day of the week', () => {
    const sections = group(
      [item('sun', '2026-10-11T10:00:00Z'), item('sat', '2026-10-10T10:00:00Z')],
      '2026-10-12T09:00:00Z'
    );
    expect(sections.map((s) => s.bucket.kind)).toEqual(['yesterday', 'earlierThisMonth']);
  });

  it('keeps This week across a month edge rather than calling it Last month', () => {
    // Thu 1 Oct 2026; the Monday-start week began Mon 28 Sep.
    expect(
      bucketsById(
        [item('mon', '2026-09-28T10:00:00Z'), item('sun', '2026-09-27T10:00:00Z')],
        '2026-10-01T12:00:00Z'
      )
    ).toEqual({ mon: { kind: 'thisWeek' }, sun: { kind: 'lastMonth' } });
  });

  it('rolls Last month and the older month headers over a year boundary', () => {
    expect(
      bucketsById(
        [
          item('dec', '2026-12-20T10:00:00Z'),
          item('nov', '2026-11-03T10:00:00Z'),
          item('prevDec', '2025-12-31T23:00:00Z'),
        ],
        '2027-01-10T12:00:00Z'
      )
    ).toEqual({
      dec: { kind: 'lastMonth' },
      nov: { kind: 'month', year: 2026, month: 11 },
      prevDec: { kind: 'month', year: 2025, month: 12 },
    });
  });

  it('reads the calendar day in the given time zone, not UTC', () => {
    const mail = [item('m', '2026-10-15T20:00:00Z')];
    const now = '2026-10-16T09:00:00Z';
    expect(bucketsById(mail, now, 'UTC')).toEqual({ m: { kind: 'yesterday' } });
    // Auckland is UTC+13 in October: the mail landed at 09:00 on the 16th, and it is now 22:00 the same day.
    expect(bucketsById(mail, now, 'Pacific/Auckland')).toEqual({ m: { kind: 'today' } });
  });

  it('orders sections newest first, skips empty ones, and never repeats a header', () => {
    const sections = group(
      [
        item('old', '2026-06-01T10:00:00Z'),
        item('today1', '2026-10-16T10:00:00Z'),
        item('lastMonth', '2026-09-10T10:00:00Z'),
        item('today2', '2026-10-16T08:00:00Z'),
        item('older', '2026-07-01T10:00:00Z'),
      ],
      FRIDAY_NOON
    );
    expect(sections.map((s) => [s.key, s.items.map((i) => i.id)])).toEqual([
      ['today', ['today1', 'today2']],
      ['lastMonth', ['lastMonth']],
      ['month-2026-07', ['older']],
      ['month-2026-06', ['old']],
    ]);
  });

  it('files a future timestamp under Today and an undated mail last', () => {
    const sections = group(
      [item('none'), item('bad', 'not a date'), item('future', '2026-10-20T10:00:00Z')],
      FRIDAY_NOON
    );
    expect(sections.map((s) => [s.bucket.kind, s.items.map((i) => i.id)])).toEqual([
      ['today', ['future']],
      ['undated', ['none', 'bad']],
    ]);
  });

  it('returns no sections for no mail', () => {
    expect(group([], FRIDAY_NOON)).toEqual([]);
  });
});
