import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  addWeeks,
  buildMonthGrid,
  buildWeekDays,
  dayKey,
  formatMonthLabel,
  formatWeekLabel,
  groupByDayKey,
  isSameDay,
  parseJumpDate,
  startOfWeek,
  weekdayLabels,
} from './calendarGrid';

describe('dayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(dayKey(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('isSameDay', () => {
  it('is true for the same calendar day regardless of time', () => {
    expect(isSameDay(new Date(2026, 8, 1, 3), new Date(2026, 8, 1, 23))).toBe(true);
  });

  it('is false across a day boundary', () => {
    expect(isSameDay(new Date(2026, 8, 1, 23), new Date(2026, 8, 2, 0))).toBe(false);
  });
});

describe('addDays / addMonths / addWeeks', () => {
  it('addDays advances the calendar day', () => {
    expect(dayKey(addDays(new Date(2026, 8, 1), 5))).toBe('2026-09-06');
  });

  it('addWeeks advances by 7 days per week', () => {
    expect(dayKey(addWeeks(new Date(2026, 8, 1), 1))).toBe('2026-09-08');
  });

  it('addMonths preserves the day-of-month anchor', () => {
    expect(dayKey(addMonths(new Date(2026, 8, 15), 1))).toBe('2026-10-15');
    expect(dayKey(addMonths(new Date(2026, 8, 15), -1))).toBe('2026-08-15');
  });
});

describe('startOfWeek', () => {
  it('rewinds to Monday for a mid-week date', () => {
    // 2026-09-03 is a Thursday.
    expect(dayKey(startOfWeek(new Date(2026, 8, 3)))).toBe('2026-08-31');
  });

  it('is a no-op for a date that is already Monday', () => {
    expect(dayKey(startOfWeek(new Date(2026, 7, 31)))).toBe('2026-08-31');
  });

  it('rewinds a Sunday to the Monday six days earlier', () => {
    expect(dayKey(startOfWeek(new Date(2026, 8, 6)))).toBe('2026-08-31');
  });
});

describe('buildMonthGrid', () => {
  it('always returns 42 cells (6 Monday-first weeks)', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1));
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(1); // Monday
  });

  it('flags leading/trailing days outside the anchor month', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1));
    expect(grid[0].inCurrentMonth).toBe(false); // 2026-08-31
    const first = grid.find((day) => day.key === '2026-09-01');
    expect(first?.inCurrentMonth).toBe(true);
    const last = grid[grid.length - 1];
    expect(last.key >= '2026-10-01').toBe(true);
    expect(last.inCurrentMonth).toBe(false);
  });

  it('marks isToday only for the injected today, never the real clock', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1), new Date(2026, 8, 15));
    const today = grid.find((day) => day.isToday);
    expect(today?.key).toBe('2026-09-15');
    expect(grid.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('has no isToday cell when today falls outside the grid', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1), new Date(2020, 0, 1));
    expect(grid.some((day) => day.isToday)).toBe(false);
  });
});

describe('buildWeekDays', () => {
  it('returns 7 Monday-first days containing the anchor', () => {
    const week = buildWeekDays(new Date(2026, 8, 3));
    expect(week).toHaveLength(7);
    expect(week[0].key).toBe('2026-08-31');
    expect(week[6].key).toBe('2026-09-06');
  });

  it('handles a week that crosses a month/year rollover', () => {
    const week = buildWeekDays(new Date(2025, 11, 31));
    expect(week[0].key).toBe('2025-12-29');
    expect(week[6].key).toBe('2026-01-04');
  });

  it('marks isToday for the injected today within the week', () => {
    const week = buildWeekDays(new Date(2026, 8, 3), new Date(2026, 8, 3));
    expect(week.filter((day) => day.isToday)).toHaveLength(1);
    expect(week.find((day) => day.isToday)?.key).toBe('2026-09-03');
  });
});

describe('weekdayLabels', () => {
  it('returns 7 short labels, Monday first', () => {
    const labels = weekdayLabels();
    expect(labels).toHaveLength(7);
    expect(new Set(labels).size).toBe(7);
  });
});

describe('formatMonthLabel / formatWeekLabel', () => {
  it('formats a month label with month and year', () => {
    const label = formatMonthLabel(new Date(2026, 8, 1));
    expect(label).toContain('2026');
    expect(label).toMatch(/September/);
  });

  it('formats a week label spanning both boundary dates', () => {
    const label = formatWeekLabel(new Date(2026, 8, 3));
    expect(label).toContain('2026');
  });
});

describe('groupByDayKey', () => {
  it('buckets items by local day and keeps chronological order within a day', () => {
    const items = [
      { id: 1, date: new Date(2026, 8, 1, 18) },
      { id: 2, date: new Date(2026, 8, 1, 9) },
      { id: 3, date: new Date(2026, 8, 2, 12) },
    ];
    const grouped = groupByDayKey(items, (item) => item.date);
    expect(grouped.get('2026-09-01')?.map((item) => item.id)).toEqual([2, 1]);
    expect(grouped.get('2026-09-02')?.map((item) => item.id)).toEqual([3]);
  });

  it('returns an empty map for no items', () => {
    expect(groupByDayKey([], (item: { date: Date }) => item.date).size).toBe(0);
  });
});

describe('parseJumpDate', () => {
  it('parses a valid YYYY-MM-DD input (the native date input contract) as local midnight', () => {
    const date = parseJumpDate('2026-09-03');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(3);
    expect(date?.getHours()).toBe(0);
  });

  it('returns null for an empty string', () => {
    expect(parseJumpDate('')).toBeNull();
  });

  it('returns null for a malformed string', () => {
    expect(parseJumpDate('not-a-date')).toBeNull();
    expect(parseJumpDate('2026-13-40')).toBeNull();
  });
});
