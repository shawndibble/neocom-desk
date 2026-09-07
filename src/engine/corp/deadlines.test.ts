import { describe, expect, it } from 'vitest';
import { DEADLINE_STRIP_DAYS, deadlinesByDay, dueSoon, groupBoardByKind } from './deadlines';
import {
  CORP_BOARD_ITEM_KINDS,
  type CorpBoardItem,
  type CorpBoardItemKind,
  type CorpBoardSeverity,
  type CorpBoardTiming,
} from './board';

/**
 * Midday local time, so every "+N days" below stays inside the same local day
 * no matter which zone the suite runs in — a fixture at 23:30 would slide into
 * the next day for half the planet.
 */
const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function item(
  overrides: Partial<CorpBoardItem> & { id: string } & Record<string, unknown>
): CorpBoardItem {
  const timing = (overrides.timing ?? 'timed') as CorpBoardTiming;
  const deadlineMs = overrides.deadlineMs ?? (timing === 'timed' ? NOW + HOUR : null);
  return {
    kind: 'structureFuel' as CorpBoardItemKind,
    subject: 'Somewhere',
    detail: '',
    deadlineMs,
    remainingMs: deadlineMs === null ? null : deadlineMs - NOW,
    timing,
    severity: 'clear' as CorpBoardSeverity,
    typeId: null,
    withinStaleWindow: false,
    ...overrides,
  } as CorpBoardItem;
}

/** Local midnight of the day `ms` falls in — the same identity the strip uses. */
function midnight(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

describe('deadlinesByDay', () => {
  it('returns one entry per day, starting today', () => {
    const strip = deadlinesByDay([], NOW, 14);

    expect(strip).toHaveLength(14);
    expect(strip[0].startMs).toBe(midnight(NOW));
    expect(strip[13].startMs).toBe(midnight(NOW + 13 * DAY));
  });

  it('defaults to a fortnight', () => {
    expect(deadlinesByDay([], NOW)).toHaveLength(DEADLINE_STRIP_DAYS);
  });

  it('keeps empty days, counting zero', () => {
    const strip = deadlinesByDay([item({ id: 'a', deadlineMs: NOW + 2 * DAY })], NOW, 5);

    expect(strip.map((day) => day.count)).toEqual([0, 0, 1, 0, 0]);
    expect(strip[1].severity).toBeNull();
  });

  it('buckets a timed item on the local calendar day its deadline falls in', () => {
    const strip = deadlinesByDay(
      [
        item({ id: 'today', deadlineMs: NOW + 3 * HOUR }),
        item({ id: 'tomorrow', deadlineMs: NOW + DAY }),
        item({ id: 'last-day', deadlineMs: NOW + 13 * DAY }),
      ],
      NOW,
      14
    );

    expect(strip[0].count).toBe(1);
    expect(strip[1].count).toBe(1);
    expect(strip[13].count).toBe(1);
  });

  it('excludes an item beyond the window', () => {
    const strip = deadlinesByDay(
      [
        item({ id: 'just-outside', deadlineMs: NOW + 14 * DAY }),
        item({ id: 'far', deadlineMs: NOW + 25 * DAY }),
      ],
      NOW,
      14
    );

    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(0);
  });

  // ESI drops `fuel_expires` once a structure runs dry, so there is no instant
  // left to bucket — but the thing is outstanding now, which is day 0.
  it('counts a passed item on day 0', () => {
    const strip = deadlinesByDay(
      [item({ id: 'dry', timing: 'passed', deadlineMs: null, severity: 'critical' })],
      NOW,
      14
    );

    expect(strip[0].count).toBe(1);
    expect(strip[0].severity).toBe('critical');
  });

  it('counts an overdue but still-timed item on day 0, not on the day it expired', () => {
    const strip = deadlinesByDay([item({ id: 'late', deadlineMs: NOW - 2 * DAY })], NOW, 14);

    expect(strip[0].count).toBe(1);
    expect(strip.slice(1).every((day) => day.count === 0)).toBe(true);
  });

  // An offline service is a standing fault with no instant at all. Counting it
  // on any day would invent a deadline it does not have.
  it('counts an untimed item on no day', () => {
    const strip = deadlinesByDay(
      [item({ id: 'offline', kind: 'serviceOffline', timing: 'untimed', deadlineMs: null })],
      NOW,
      14
    );

    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(0);
  });

  // The row refuses to print a figure for these, which is a display decision.
  // The count is a different claim and stays true.
  it('counts an under-cache-window item on day 0', () => {
    const strip = deadlinesByDay(
      [
        item({
          id: 'soon',
          deadlineMs: NOW + 45 * 60_000,
          withinStaleWindow: true,
          severity: 'critical',
        }),
      ],
      NOW,
      14
    );

    expect(strip[0].count).toBe(1);
  });

  it('gives a day the worst severity landing on it', () => {
    const strip = deadlinesByDay(
      [
        item({ id: 'clear', deadlineMs: NOW + DAY, severity: 'clear' }),
        item({ id: 'critical', deadlineMs: NOW + DAY, severity: 'critical' }),
        item({ id: 'watch', deadlineMs: NOW + DAY, severity: 'watch' }),
      ],
      NOW,
      14
    );

    expect(strip[1].count).toBe(3);
    expect(strip[1].severity).toBe('critical');
  });

  it('prefers warning over watch and clear', () => {
    const strip = deadlinesByDay(
      [
        item({ id: 'watch', deadlineMs: NOW + DAY, severity: 'watch' }),
        item({ id: 'warning', deadlineMs: NOW + DAY, severity: 'warning' }),
      ],
      NOW,
      14
    );

    expect(strip[1].severity).toBe('warning');
  });

  /**
   * AC2's reconciliation, stated as a test: the strip's total equals the board
   * items *inside the window*, never the board's own total. The two disagree by
   * exactly the untimed items and the ones further out than the window, and a
   * future change that quietly starts counting either would fail here.
   */
  it('sums to the board items inside the window, not the whole board', () => {
    const items = [
      item({ id: 'dry', timing: 'passed', deadlineMs: null }),
      item({ id: 'today', deadlineMs: NOW + 5 * HOUR }),
      item({ id: 'tomorrow', deadlineMs: NOW + DAY }),
      item({ id: 'day-8', deadlineMs: NOW + 8 * DAY }),
      item({ id: 'beyond', deadlineMs: NOW + 25 * DAY }),
      item({ id: 'offline', kind: 'serviceOffline', timing: 'untimed', deadlineMs: null }),
    ];

    const strip = deadlinesByDay(items, NOW, 14);

    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(4);
    expect(items).toHaveLength(6);
  });

  it('treats a non-positive day count as an empty strip', () => {
    expect(deadlinesByDay([item({ id: 'a' })], NOW, 0)).toEqual([]);
    expect(deadlinesByDay([item({ id: 'a' })], NOW, -3)).toEqual([]);
  });
});

describe('dueSoon', () => {
  it('counts everything inside the window', () => {
    const result = dueSoon(
      [
        item({ id: 'now-ish', deadlineMs: NOW + HOUR }),
        item({ id: 'late-today', deadlineMs: NOW + 23 * HOUR }),
        item({ id: 'tomorrow', deadlineMs: NOW + 30 * HOUR }),
      ],
      NOW
    );

    expect(result.total).toBe(2);
    expect(result.overdue).toBe(0);
  });

  it('counts an item exactly on the window edge', () => {
    expect(dueSoon([item({ id: 'edge', deadlineMs: NOW + 86_400_000 })], NOW).total).toBe(1);
  });

  it('reports overdue items separately, and inside the total', () => {
    const result = dueSoon(
      [
        item({ id: 'late', deadlineMs: NOW - 9 * HOUR }),
        item({ id: 'dry', timing: 'passed', deadlineMs: null }),
        item({ id: 'soon', deadlineMs: NOW + 2 * HOUR }),
      ],
      NOW
    );

    expect(result.total).toBe(3);
    expect(result.overdue).toBe(2);
  });

  it('excludes untimed items — they have no deadline to be inside a window', () => {
    const result = dueSoon(
      [item({ id: 'offline', kind: 'serviceOffline', timing: 'untimed', deadlineMs: null })],
      NOW
    );

    expect(result).toEqual({ total: 0, overdue: 0 });
  });

  it('takes a custom window', () => {
    const items = [item({ id: 'in-3h', deadlineMs: NOW + 3 * HOUR })];

    expect(dueSoon(items, NOW, 2 * HOUR).total).toBe(0);
    expect(dueSoon(items, NOW, 4 * HOUR).total).toBe(1);
  });
});

describe('groupBoardByKind', () => {
  it('groups in declared kind order, not in board order', () => {
    const grouped = groupBoardByKind([
      item({ id: 'job', kind: 'jobDelivery' }),
      item({ id: 'fuel', kind: 'structureFuel' }),
      item({ id: 'timer', kind: 'structureTimer' }),
    ]);

    expect([...grouped.keys()]).toEqual(['structureTimer', 'structureFuel', 'jobDelivery']);
  });

  it('omits a kind with nothing due, so "no rows" stays distinct from "no card"', () => {
    const grouped = groupBoardByKind([item({ id: 'fuel', kind: 'structureFuel' })]);

    expect(grouped.has('structureFuel')).toBe(true);
    expect(grouped.has('moonExtraction')).toBe(false);
    expect(grouped.size).toBe(1);
  });

  it('keeps the board ordering inside a group', () => {
    const grouped = groupBoardByKind([
      item({ id: 'first', kind: 'structureFuel' }),
      item({ id: 'second', kind: 'moonExtraction' }),
      item({ id: 'third', kind: 'structureFuel' }),
    ]);

    expect(grouped.get('structureFuel')?.map((entry) => entry.id)).toEqual(['first', 'third']);
  });

  it('is empty for an empty board', () => {
    expect(groupBoardByKind([]).size).toBe(0);
  });

  it('handles every declared kind', () => {
    const grouped = groupBoardByKind(
      CORP_BOARD_ITEM_KINDS.map((kind) =>
        item({
          id: kind,
          kind,
          timing: kind === 'serviceOffline' ? 'untimed' : 'timed',
          deadlineMs: kind === 'serviceOffline' ? null : NOW + HOUR,
        })
      )
    );

    expect([...grouped.keys()]).toEqual([...CORP_BOARD_ITEM_KINDS]);
  });
});
