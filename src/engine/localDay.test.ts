import { describe, it, expect } from 'vitest';
import {
  cellDayStart,
  cellOf,
  dayStart,
  localMidnight,
  nextDay,
  nextLocalDay,
  shiftUtcDate,
  utcDay,
} from './localDay';

describe('dayStart / nextDay / cellDayStart / cellOf', () => {
  const lateEvening = Date.UTC(2026, 5, 15, 23, 30);

  it('cuts the EVE day at 00:00 UTC', () => {
    expect(dayStart(lateEvening, 'UTC')).toBe(Date.UTC(2026, 5, 15));
    expect(dayStart(Date.UTC(2026, 5, 15), 'UTC')).toBe(Date.UTC(2026, 5, 15));
    expect(dayStart(Date.UTC(2026, 5, 15) - 1, 'UTC')).toBe(Date.UTC(2026, 5, 14));
    expect(nextDay(Date.UTC(2026, 5, 15), 'UTC')).toBe(Date.UTC(2026, 5, 16));
  });

  it('falls back to the local day without a zone', () => {
    expect(dayStart(lateEvening, undefined)).toBe(localMidnight(lateEvening));
    expect(nextDay(localMidnight(lateEvening), undefined)).toBe(
      nextLocalDay(localMidnight(lateEvening))
    );
  });

  it('keys a grid cell by the day it names on either clock', () => {
    const cell = new Date(2026, 5, 15);
    expect(cellDayStart(cell, 'UTC')).toBe(Date.UTC(2026, 5, 15));
    expect(cellDayStart(cell, undefined)).toBe(cell.getTime());
  });

  it('files an instant under the same cell key its own cell carries', () => {
    for (const zone of ['UTC', undefined] as const) {
      expect(cellDayStart(cellOf(lateEvening, zone), zone)).toBe(dayStart(lateEvening, zone));
    }
    expect(cellOf(lateEvening, 'UTC')).toEqual(new Date(2026, 5, 15));
  });
});

describe('localMidnight', () => {
  it('zeroes the local clock fields', () => {
    const ms = new Date(2026, 5, 15, 13, 45, 30, 123).getTime();
    expect(localMidnight(ms)).toBe(new Date(2026, 5, 15).getTime());
  });

  it('is idempotent on a midnight', () => {
    const midnight = new Date(2026, 5, 15).getTime();
    expect(localMidnight(midnight)).toBe(midnight);
  });

  it('keeps the last millisecond of a day on that day', () => {
    const ms = new Date(2026, 5, 15, 23, 59, 59, 999).getTime();
    expect(localMidnight(ms)).toBe(new Date(2026, 5, 15).getTime());
  });
});

describe('nextLocalDay', () => {
  it('returns the following local midnight', () => {
    expect(nextLocalDay(new Date(2026, 5, 15).getTime())).toBe(new Date(2026, 5, 16).getTime());
  });

  it('rolls over month and year ends', () => {
    expect(nextLocalDay(new Date(2026, 0, 31).getTime())).toBe(new Date(2026, 1, 1).getTime());
    expect(nextLocalDay(new Date(2026, 11, 31).getTime())).toBe(new Date(2027, 0, 1).getTime());
  });

  it('is calendar-based across a DST change, not a fixed 24h step', () => {
    for (const month of [2, 9, 10]) {
      for (let day = 1; day <= 31; day++) {
        const start = new Date(2026, month, day).getTime();
        const next = nextLocalDay(start);
        const expected = new Date(2026, month, day + 1).getTime();
        expect(next).toBe(expected);
        expect(localMidnight(next)).toBe(next);
      }
    }
  });
});

describe('utcDay', () => {
  it('is the UTC calendar date', () =>
    expect(utcDay(Date.UTC(2026, 9, 18, 23, 59))).toBe('2026-10-18'));
  it('defaults to now', () => expect(utcDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});

describe('shiftUtcDate', () => {
  it('moves across a month boundary', () =>
    expect(shiftUtcDate('2026-03-01', -1)).toBe('2026-02-28'));
  it('moves forward', () => expect(shiftUtcDate('2026-12-31', 1)).toBe('2027-01-01'));
});
