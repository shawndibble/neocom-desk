import { describe, it, expect } from 'vitest';
import { iskPerCalendarHour } from './yieldRate';

describe('iskPerCalendarHour', () => {
  it('divides total value by the full 24h span of a single-day window', () => {
    expect(iskPerCalendarHour(2_400_000, ['2026-09-04'])).toBe(100_000);
  });

  it('spans from the earliest to the latest date, inclusive, regardless of input order', () => {
    // 2026-09-04 .. 2026-09-06 inclusive = 3 days = 72 hours
    expect(iskPerCalendarHour(7_200_000, ['2026-09-06', '2026-09-04', '2026-09-05'])).toBe(100_000);
  });

  it('ignores duplicate dates when finding the span', () => {
    expect(iskPerCalendarHour(2_400_000, ['2026-09-04', '2026-09-04', '2026-09-04'])).toBe(100_000);
  });

  it('returns null for no dates, never a fabricated rate', () => {
    expect(iskPerCalendarHour(0, [])).toBeNull();
  });
});
