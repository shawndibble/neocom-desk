import { describe, it, expect } from 'vitest';
import { localMidnight, nextLocalDay } from './localDay';

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
