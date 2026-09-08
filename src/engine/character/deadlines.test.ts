import { describe, expect, it } from 'vitest';
import { buildCharacterBoard, CHARACTER_BOARD_ITEM_KINDS, type BoardClockSource } from './board';
import {
  countsByDay,
  countsByKind,
  filterByKinds,
  groupByDay,
  localMidnight,
  relativeDayFor,
} from './deadlines';

/**
 * Every instant here is built with the local-time `Date` constructor rather
 * than an ISO string, so the suite means the same thing under any `TZ` — which
 * matters, because local calendar days are exactly what this module buckets.
 */
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

  /**
   * Built by zeroing a `Date`'s clock fields rather than by subtracting a
   * modulus, so a day that is 23 or 25 hours long still lands on its own
   * midnight. A `ms % 86_400_000` would drift by an hour for the rest of the
   * year on either side of a DST change.
   */
  it('survives a day that is not 24 hours long', () => {
    const beforeChange = local(2026, 3, 28, 12);
    const afterChange = local(2026, 3, 30, 12);
    expect(localMidnight(beforeChange)).toBe(local(2026, 3, 28, 0, 0));
    expect(localMidnight(afterChange)).toBe(local(2026, 3, 30, 0, 0));
  });
});

describe('countsByDay', () => {
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

  /**
   * The count carries how much lands on a day; the kinds carry what it is.
   * Listing a kind once however many items it contributes is what lets the
   * map spend one dot per kind rather than one per item — four skill
   * completions are one fact about the day, not four.
   */
  it('lists each kind once, in board order, whatever order the items arrive in', () => {
    const board = buildCharacterBoard({
      nowMs: NOW,
      // Deliberately handed in an order that is neither board order nor the
      // order they fall due, so a pass cannot come from either accident.
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
      contractExpiries: [clock('contract', day)],
      orderExpiries: [clock('order', day)],
    });

    expect(countsByDay(board).get(local(2026, 9, 11, 0, 0))).toEqual({
      count: 6,
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

  /**
   * "Tomorrow" is the next calendar day, not `now + 24h` — at 23:00 those are
   * different days, and the label sits above a group the user reads as dates.
   */
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

  /**
   * An empty selection means "nothing chosen", and the view owes the user an
   * explicit say-so rather than a list that silently looks like no data. It
   * deliberately does NOT mean "everything" — the filter's own default holds
   * every kind, so an empty set can only be something the user did on purpose.
   */
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
