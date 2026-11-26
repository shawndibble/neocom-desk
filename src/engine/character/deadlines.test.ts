import { DAY_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { buildCharacterBoard, CHARACTER_BOARD_ITEM_KINDS, type BoardClockSource } from './board';
import {
  countsByDay,
  countsByKind,
  filterByKinds,
  groupByDay,
  localMidnight,
  relativeDayFor,
  splitOverdueBeforeToday,
  calendarDaysBefore,
} from './deadlines';

const local = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

const NOW = local(2026, 9, 7, 18, 42);

function clock(id: string, deadlineMs: number): BoardClockSource {
  return { id, subject: id, detail: '', deadlineMs };
}

describe('localMidnight', () => {
  it('floors an instant to the start of its own local day', () => {
    expect(localMidnight(local(2026, 9, 7, 23, 59))).toBe(local(2026, 9, 7, 0, 0));
    expect(localMidnight(local(2026, 9, 7, 0, 0))).toBe(local(2026, 9, 7, 0, 0));
  });

  it('survives a day that is not 24 hours long', () => {
    const beforeChange = local(2026, 3, 28, 12);
    const afterChange = local(2026, 3, 30, 12);
    expect(localMidnight(beforeChange)).toBe(local(2026, 3, 28, 0, 0));
    expect(localMidnight(afterChange)).toBe(local(2026, 3, 30, 0, 0));
  });
});

describe('countsByDay', () => {
  it('buckets on EVE (UTC) days when asked, whatever the machine zone', () => {
    const board = buildCharacterBoard({
      nowMs: Date.UTC(2026, 8, 7, 12),
      industryJobs: [
        clock('a', Date.UTC(2026, 8, 7, 23, 30)),
        clock('b', Date.UTC(2026, 8, 8, 0, 30)),
      ],
    });

    const days = countsByDay(board, 'UTC');

    expect(days.get(Date.UTC(2026, 8, 7))?.count).toBe(1);
    expect(days.get(Date.UTC(2026, 8, 8))?.count).toBe(1);
    expect(groupByDay(board, 'UTC').map((group) => group.dayStartMs)).toEqual([
      Date.UTC(2026, 8, 7),
      Date.UTC(2026, 8, 8),
    ]);
    expect(relativeDayFor(Date.UTC(2026, 8, 8), Date.UTC(2026, 8, 7, 23), 'UTC')).toBe('tomorrow');
  });

  it('counts what lands on each local day, and skips the days nothing lands on', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      industryJobs: [
        clock('a', local(2026, 9, 7, 20)),
        clock('b', local(2026, 9, 7, 22)),
        clock('c', local(2026, 9, 20, 9)),
      ],
    });

    const days = countsByDay(board);

    expect(days.get(local(2026, 9, 7, 0, 0))).toEqual({ count: 2, kinds: ['industryJob'] });
    expect(days.get(local(2026, 9, 20, 0, 0))).toEqual({ count: 1, kinds: ['industryJob'] });
    expect(days.has(local(2026, 9, 8, 0, 0))).toBe(false);
  });

  it('lists each kind once, in board order, whatever order the items arrive in', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      orderExpiries: [clock('order', local(2026, 9, 11, 8))],
      industryJobs: [clock('job-1', local(2026, 9, 11, 9)), clock('job-2', local(2026, 9, 11, 21))],
      calendarEvents: [
        {
          id: 'op',
          subject: 'op',
          detail: '',
          deadlineMs: local(2026, 9, 11, 19),
          response: 'accepted',
          important: false,
        },
      ],
    });

    expect(countsByDay(board).get(local(2026, 9, 11, 0, 0))).toEqual({
      count: 4,
      kinds: ['calendarEvent', 'industryJob', 'orderExpiry'],
    });
  });

  it('holds every kind a day can carry without collapsing any of them', () => {
    const day = local(2026, 9, 11, 9);
    const board = buildCharacterBoard({
      nowMs: NOW,
      calendarEvents: [
        {
          id: 'op',
          subject: 'op',
          detail: '',
          deadlineMs: day,
          response: 'accepted',
          important: false,
        },
      ],
      skillTraining: [clock('skill', day)],
      industryJobs: [clock('job', day)],
      planetExtractions: [clock('planet', day)],
      mercenaryDens: [clock('den', day)],
      moonChunks: [clock('moon', day)],
      sharedMoonPops: [clock('sharedPop', day)],
      structureFuel: [clock('fuel', day)],
      structureTimers: [clock('timer', day)],
      corpJobs: [clock('corpJob', day)],
      skyhookRaids: [clock('skyhook', day)],
      contractExpiries: [clock('contract', day)],
      orderExpiries: [clock('order', day)],
      accelerator: [clock('accelerator', day)],
    });

    expect(countsByDay(board).get(local(2026, 9, 11, 0, 0))).toEqual({
      count: 14,
      kinds: [...CHARACTER_BOARD_ITEM_KINDS],
    });
  });
});

describe('groupByDay', () => {
  it('groups consecutive days in board order without re-sorting', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      industryJobs: [
        clock('today-late', local(2026, 9, 7, 23)),
        clock('today-early', local(2026, 9, 7, 19)),
        clock('tomorrow', local(2026, 9, 8, 9)),
      ],
    });

    const groups = groupByDay(board);

    expect(groups.map((group) => group.dayStartMs)).toEqual([
      local(2026, 9, 7, 0, 0),
      local(2026, 9, 8, 0, 0),
    ]);
    expect(groups[0].items.map((item) => item.sourceId)).toEqual(['today-early', 'today-late']);
  });

  it('is empty for an empty board', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('relativeDayFor', () => {
  it('names today and tomorrow, and nothing else', () => {
    expect(relativeDayFor(local(2026, 9, 7, 0, 0), NOW)).toBe('today');
    expect(relativeDayFor(local(2026, 9, 8, 0, 0), NOW)).toBe('tomorrow');
    expect(relativeDayFor(local(2026, 9, 9, 0, 0), NOW)).toBe('other');
    expect(relativeDayFor(local(2026, 9, 6, 0, 0), NOW)).toBe('other');
  });

  it('reads calendar days rather than a rolling 24 hours', () => {
    const lateTonight = local(2026, 9, 7, 23, 30);
    expect(relativeDayFor(local(2026, 9, 8, 0, 0), lateTonight)).toBe('tomorrow');
    expect(relativeDayFor(local(2026, 9, 7, 0, 0), lateTonight)).toBe('today');
  });
});

describe('filterByKinds', () => {
  const board = buildCharacterBoard({
    nowMs: NOW,
    calendarEvents: [
      {
        id: 'e',
        subject: 'CTA',
        detail: '',
        deadlineMs: NOW + 1,
        response: 'accepted',
        important: false,
      },
    ],
    industryJobs: [clock('j', NOW + 2)],
    orderExpiries: [clock('o', NOW + 3)],
  });

  it('keeps only the chosen kinds, in the order the board already settled', () => {
    const kept = filterByKinds(board, new Set(['orderExpiry', 'calendarEvent'] as const));
    expect(kept.map((item) => item.sourceId)).toEqual(['e', 'o']);
  });

  it('returns nothing when no kind is selected', () => {
    expect(filterByKinds(board, new Set())).toEqual([]);
  });
});

describe('countsByKind', () => {
  it('counts each kind present and omits the ones that are not', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      industryJobs: [clock('a', NOW + 1), clock('b', NOW + 2)],
      orderExpiries: [clock('c', NOW + 3)],
    });

    const counts = countsByKind(board);

    expect(counts.get('industryJob')).toBe(2);
    expect(counts.get('orderExpiry')).toBe(1);
    expect(counts.get('calendarEvent')).toBeUndefined();
  });
});

describe('splitOverdueBeforeToday', () => {
  it('folds everything overdue from before today, in board order, oldest first', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      planetExtractions: [
        clock('month-old', NOW - 31 * DAY_MS),
        clock('week-old', NOW - 7 * DAY_MS),
        clock('yesterday', NOW - DAY_MS),
        clock('soon', NOW + DAY_MS),
      ],
    });
    const { beforeToday, rest } = splitOverdueBeforeToday(board, NOW, undefined);
    expect(beforeToday.map((i) => i.subject)).toEqual(['month-old', 'week-old', 'yesterday']);
    expect(rest.map((i) => i.subject)).toEqual(['soon']);
  });

  it("keeps today's overdue items in place, even minutes past the midnight before them", () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      planetExtractions: [
        clock('last-night', localMidnight(NOW) - 1),
        clock('this-morning', localMidnight(NOW) + 1),
        clock('just-now', NOW - 1),
        clock('soon', NOW + DAY_MS),
      ],
    });
    const { beforeToday, rest } = splitOverdueBeforeToday(board, NOW, undefined);
    expect(beforeToday.map((i) => i.subject)).toEqual(['last-night']);
    expect(rest.map((i) => i.subject)).toEqual(['this-morning', 'just-now', 'soon']);
  });

  it('cuts the day on the UTC clock when asked', () => {
    const utcMidnight = Date.UTC(2026, 9, 7);
    const now = utcMidnight + 5 * 3_600_000;
    const board = buildCharacterBoard({
      nowMs: now,
      planetExtractions: [clock('before', utcMidnight - 1), clock('after', utcMidnight + 1)],
    });
    const { beforeToday, rest } = splitOverdueBeforeToday(board, now, 'UTC');
    expect(beforeToday.map((i) => i.subject)).toEqual(['before']);
    expect(rest.map((i) => i.subject)).toEqual(['after']);
  });

  it('keeps everything when nothing is overdue from before today', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      planetExtractions: [clock('soon', NOW + DAY_MS)],
    });
    expect(splitOverdueBeforeToday(board, NOW, undefined)).toEqual({
      beforeToday: [],
      rest: board,
    });
  });
});

describe('calendarDaysBefore', () => {
  it('counts calendar days, so a minute before midnight is already 1 day back', () => {
    expect(calendarDaysBefore(localMidnight(NOW) - 1, NOW, undefined)).toBe(1);
    expect(calendarDaysBefore(localMidnight(NOW) - 1, localMidnight(NOW) + 60_000, undefined)).toBe(
      1
    );
    expect(calendarDaysBefore(NOW - 31 * DAY_MS, NOW, undefined)).toBe(31);
  });

  it('is 0 for a deadline on the same day', () => {
    expect(calendarDaysBefore(localMidnight(NOW) + 1, NOW, undefined)).toBe(0);
  });

  it('cuts the day on the UTC clock when asked', () => {
    const utcMidnight = Date.UTC(2026, 9, 7);
    expect(calendarDaysBefore(utcMidnight - 1, utcMidnight + 5 * 3_600_000, 'UTC')).toBe(1);
  });
});
