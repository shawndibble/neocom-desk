import { DAY_MS, HOUR_MS } from '@/lib/age';
import { afterEach, describe, expect, it } from 'vitest';
import { DEADLINE_STRIP_DAYS, deadlinesByDay, dueSoon } from './deadlines';
import {
  type CorpBoardItem,
  type CorpBoardItemKind,
  type CorpBoardSeverity,
  type CorpBoardTiming,
} from './board';

const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime();

function item(
  overrides: Partial<CorpBoardItem> & { id: string } & Record<string, unknown>
): CorpBoardItem {
  const timing = (overrides.timing ?? 'timed') as CorpBoardTiming;
  const deadlineMs = overrides.deadlineMs ?? (timing === 'timed' ? NOW + HOUR_MS : null);
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

function midnight(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

describe('deadlinesByDay', () => {
  it('returns one entry per day, starting today', () => {
    const strip = deadlinesByDay([], NOW, 14);

    expect(strip).toHaveLength(14);
    expect(strip[0].startMs).toBe(midnight(NOW));
    expect(strip[13].startMs).toBe(midnight(NOW + 13 * DAY_MS));
  });

  it('defaults to a fortnight', () => {
    expect(deadlinesByDay([], NOW)).toHaveLength(DEADLINE_STRIP_DAYS);
  });

  it('keeps empty days, counting zero', () => {
    const strip = deadlinesByDay([item({ id: 'a', deadlineMs: NOW + 2 * DAY_MS })], NOW, 5);

    expect(strip.map((day) => day.count)).toEqual([0, 0, 1, 0, 0]);
    expect(strip[1].severity).toBeNull();
  });

  it('buckets a timed item on the local calendar day its deadline falls in', () => {
    const strip = deadlinesByDay(
      [
        item({ id: 'today', deadlineMs: NOW + 3 * HOUR_MS }),
        item({ id: 'tomorrow', deadlineMs: NOW + DAY_MS }),
        item({ id: 'last-day', deadlineMs: NOW + 13 * DAY_MS }),
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
        item({ id: 'just-outside', deadlineMs: NOW + 14 * DAY_MS }),
        item({ id: 'far', deadlineMs: NOW + 25 * DAY_MS }),
      ],
      NOW,
      14
    );

    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(0);
  });

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
    const strip = deadlinesByDay([item({ id: 'late', deadlineMs: NOW - 2 * DAY_MS })], NOW, 14);

    expect(strip[0].count).toBe(1);
    expect(strip.slice(1).every((day) => day.count === 0)).toBe(true);
  });

  it('counts an untimed item on no day', () => {
    const strip = deadlinesByDay(
      [item({ id: 'offline', kind: 'serviceOffline', timing: 'untimed', deadlineMs: null })],
      NOW,
      14
    );

    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(0);
  });

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
        item({ id: 'clear', deadlineMs: NOW + DAY_MS, severity: 'clear' }),
        item({ id: 'critical', deadlineMs: NOW + DAY_MS, severity: 'critical' }),
        item({ id: 'watch', deadlineMs: NOW + DAY_MS, severity: 'watch' }),
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
        item({ id: 'watch', deadlineMs: NOW + DAY_MS, severity: 'watch' }),
        item({ id: 'warning', deadlineMs: NOW + DAY_MS, severity: 'warning' }),
      ],
      NOW,
      14
    );

    expect(strip[1].severity).toBe('warning');
  });

  it('sums to the board items inside the window, not the whole board', () => {
    const items = [
      item({ id: 'dry', timing: 'passed', deadlineMs: null }),
      item({ id: 'today', deadlineMs: NOW + 5 * HOUR_MS }),
      item({ id: 'tomorrow', deadlineMs: NOW + DAY_MS }),
      item({ id: 'day-8', deadlineMs: NOW + 8 * DAY_MS }),
      item({ id: 'beyond', deadlineMs: NOW + 25 * DAY_MS }),
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
        item({ id: 'now-ish', deadlineMs: NOW + HOUR_MS }),
        item({ id: 'late-today', deadlineMs: NOW + 23 * HOUR_MS }),
        item({ id: 'tomorrow', deadlineMs: NOW + 30 * HOUR_MS }),
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
        item({ id: 'late', deadlineMs: NOW - 9 * HOUR_MS }),
        item({ id: 'dry', timing: 'passed', deadlineMs: null }),
        item({ id: 'soon', deadlineMs: NOW + 2 * HOUR_MS }),
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
    const items = [item({ id: 'in-3h', deadlineMs: NOW + 3 * HOUR_MS })];

    expect(dueSoon(items, NOW, 2 * HOUR_MS).total).toBe(0);
    expect(dueSoon(items, NOW, 4 * HOUR_MS).total).toBe(1);
  });
});

describe('deadlinesByDay on the Time format clock', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  const nowMs = Date.UTC(2026, 8, 7, 12);
  const lateEvening = item({ id: 'late', deadlineMs: Date.UTC(2026, 8, 8, 5) });

  it('files an instant near midnight on the local day, or on the EVE day when asked', () => {
    process.env.TZ = 'America/Los_Angeles';

    expect(deadlinesByDay([lateEvening], nowMs, 3).map((d) => d.count)).toEqual([1, 0, 0]);
    expect(deadlinesByDay([lateEvening], nowMs, 3, 'UTC').map((d) => d.count)).toEqual([0, 1, 0]);
  });

  it('starts each EVE day at UTC midnight', () => {
    process.env.TZ = 'America/Los_Angeles';

    const strip = deadlinesByDay([], nowMs, 3, 'UTC');

    expect(strip.map((d) => d.startMs)).toEqual([
      Date.UTC(2026, 8, 7),
      Date.UTC(2026, 8, 8),
      Date.UTC(2026, 8, 9),
    ]);
  });

  it('keeps local days on local midnights across a 25-hour DST day', () => {
    process.env.TZ = 'America/Los_Angeles';
    const before = new Date(2026, 9, 31, 12).getTime();
    const late = item({ id: 'x', deadlineMs: new Date(2026, 10, 2, 23, 30).getTime() });

    const strip = deadlinesByDay([late], before, 4);

    expect(strip.map((d) => d.startMs)).toEqual([
      new Date(2026, 9, 31).getTime(),
      new Date(2026, 10, 1).getTime(),
      new Date(2026, 10, 2).getTime(),
      new Date(2026, 10, 3).getTime(),
    ]);
    expect(strip.map((d) => d.count)).toEqual([0, 0, 1, 0]);
  });

  it('still lands an overdue or passed item on day 0 on either clock', () => {
    const passed = item({ id: 'p', timing: 'passed' });
    const overdue = item({ id: 'o', deadlineMs: nowMs - 3 * DAY_MS });

    expect(deadlinesByDay([passed, overdue], nowMs, 3, 'UTC')[0].count).toBe(2);
    expect(deadlinesByDay([passed, overdue], nowMs, 3)[0].count).toBe(2);
  });
});
