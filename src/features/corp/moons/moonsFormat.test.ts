import { describe, it, expect } from 'vitest';
import { dateTimeUtc, dateWithYear, periodLabel, signedIsk } from './moonsFormat';

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

describe('dateWithYear', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  it('adds the year only when it is not the current one', () => {
    expect(dateWithYear('2026-10-18', now)).toBe('18 Oct');
    expect(dateWithYear('2025-12-30T10:00:00Z', now)).toBe('30 Dec 2025');
  });
  it('marks an instant as UTC', () => {
    expect(dateTimeUtc('2026-10-18T14:00:00Z', now)).toBe('18 Oct 14:00\u00a0UTC');
  });
});

describe('signedIsk', () => {
  it('shows the direction with a real minus sign', () => {
    expect(signedIsk(-1_800_000)).toBe('\u22121,800,000');
    expect(signedIsk(4_200_000)).toBe('+4,200,000');
  });
});
