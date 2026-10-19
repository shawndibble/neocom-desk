import { describe, expect, it } from 'vitest';
import { localMidnight, nextLocalDay } from './localDay';

describe('localMidnight', () => {
  it('zeroes the clock fields in the machine zone', () => {
    const ms = new Date(2026, 9, 19, 15, 42, 7, 123).getTime();
    expect(localMidnight(ms)).toBe(new Date(2026, 9, 19).getTime());
  });

  it('is idempotent', () => {
    const midnight = new Date(2026, 9, 19).getTime();
    expect(localMidnight(midnight)).toBe(midnight);
  });
});

describe('nextLocalDay', () => {
  it('steps one calendar day, not 24 hours', () => {
    const start = new Date(2026, 9, 19).getTime();
    expect(nextLocalDay(start)).toBe(new Date(2026, 9, 20).getTime());
  });

  it('rolls over a month end', () => {
    const start = new Date(2026, 9, 31).getTime();
    expect(nextLocalDay(start)).toBe(new Date(2026, 10, 1).getTime());
  });
});
