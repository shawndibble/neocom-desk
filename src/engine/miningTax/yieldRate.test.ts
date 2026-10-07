import { describe, it, expect } from 'vitest';
import { iskPerMinedDay } from './yieldRate';

describe('iskPerMinedDay', () => {
  it('returns the whole total for a single mined day', () => {
    expect(iskPerMinedDay(2_400_000, ['2026-09-04'])).toBe(2_400_000);
  });

  it('divides by days mined, not the calendar span between them', () => {
    // 09-04 and 09-10 mined; the empty days between do not dilute the figure.
    expect(iskPerMinedDay(6_000_000, ['2026-09-04', '2026-09-10'])).toBe(3_000_000);
  });

  it('counts a day once when it has several entries', () => {
    expect(iskPerMinedDay(2_400_000, ['2026-09-04', '2026-09-04', '2026-09-04'])).toBe(2_400_000);
  });

  it('returns null for no dates, never a fabricated rate', () => {
    expect(iskPerMinedDay(0, [])).toBeNull();
  });
});
