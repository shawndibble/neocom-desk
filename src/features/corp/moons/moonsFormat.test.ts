import { describe, it, expect } from 'vitest';
import { periodLabel } from './moonsFormat';

describe('periodLabel', () => {
  it('names a whole calendar month by month', () => {
    expect(periodLabel('2026-10-01', '2026-10-31')).toBe('Oct 2026');
  });

  it('does not call a 7-day period that starts on the 1st a month', () => {
    expect(periodLabel('2026-10-01', '2026-10-07')).toBe('1–7 Oct 2026');
  });

  it('labels every row of a 7-day cadence by the days it covers', () => {
    expect(periodLabel('2026-10-08', '2026-10-14')).toBe('8–14 Oct 2026');
    expect(periodLabel('2026-09-25', '2026-10-01')).toBe('25 Sep – 1 Oct 2026');
  });
});
