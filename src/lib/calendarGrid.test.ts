import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  addWeeks,
  buildMonthGrid,
  dayKey,
  formatFortnightLabel,
  formatMonthLabel,
  isSameDay,
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

  it('defaults to Monday when weekStart is omitted', () => {
    expect(dayKey(startOfWeek(new Date(2026, 8, 3)))).toBe(
      dayKey(startOfWeek(new Date(2026, 8, 3), 'monday'))
    );
  });

  it('rewinds to Sunday for a mid-week date when weekStart is sunday', () => {
    // 2026-09-03 is a Thursday; the Sunday of that week is 2026-08-30.
    expect(dayKey(startOfWeek(new Date(2026, 8, 3), 'sunday'))).toBe('2026-08-30');
  });

  it('is a no-op for a date that is already Sunday, weekStart sunday', () => {
    expect(dayKey(startOfWeek(new Date(2026, 7, 30), 'sunday'))).toBe('2026-08-30');
  });

  it('rewinds a Saturday to the Sunday six days earlier, weekStart sunday', () => {
    expect(dayKey(startOfWeek(new Date(2026, 8, 5), 'sunday'))).toBe('2026-08-30');
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

  it('uses Sunday-first weeks when weekStart is sunday', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1), new Date(), 'sunday');
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(0); // Sunday
    expect(grid[0].key).toBe('2026-08-30');
  });
});

describe('weekdayLabels', () => {
  it('returns 7 short labels, Monday first', () => {
    const labels = weekdayLabels();
    expect(labels).toHaveLength(7);
    expect(new Set(labels).size).toBe(7);
  });

  it('rotates to Sunday first when weekStart is sunday', () => {
    const monday = weekdayLabels('monday');
    const sunday = weekdayLabels('sunday');
    expect(sunday).toHaveLength(7);
    // Sunday sits last in the Monday-first ordering and first in the
    // Sunday-first one; every other day just shifts forward by one slot.
    expect(sunday[0]).toBe(monday[6]);
    expect(sunday[1]).toBe(monday[0]);
    expect(sunday[7 - 1]).toBe(monday[5]);
  });
});

describe('formatMonthLabel / formatFortnightLabel', () => {
  it('names the month and year', () => {
    expect(formatMonthLabel(new Date(2026, 8, 3))).toMatch(/September/);
    expect(formatMonthLabel(new Date(2026, 8, 3))).toMatch(/2026/);
  });

  /**
   * The label has to span the grid it captions. `formatWeekLabel` spanned six
   * days from the Monday, which read as a seven-day range over a fourteen-day
   * grid — a caption quietly disagreeing with the thing it captions.
   */
  it("spans fourteen days from the anchor week's Monday", () => {
    const label = formatFortnightLabel(new Date(2026, 8, 3));
    expect(label).toMatch(/Aug 31/);
    expect(label).toMatch(/Sep 13/);
  });

  it('names the year on both sides when the span crosses one', () => {
    expect(formatFortnightLabel(new Date(2025, 11, 31))).toMatch(/2025/);
    expect(formatFortnightLabel(new Date(2025, 11, 31))).toMatch(/2026/);
  });

  it("spans fourteen days from the anchor week's Sunday when weekStart is sunday", () => {
    const label = formatFortnightLabel(new Date(2026, 8, 3), 'sunday');
    expect(label).toMatch(/Aug 30/);
    expect(label).toMatch(/Sep 12/);
  });
});
