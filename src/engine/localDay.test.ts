import { describe, expect, it } from 'vitest';
import { shiftUtcDate, utcDay } from './localDay';

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
