import { describe, expect, it } from 'vitest';
import { verifyPeriodLabel } from './verifyPeriodLabel';

describe('verifyPeriodLabel', () => {
  it('writes a same-month week as "2–8 Oct 2026"', () => {
    expect(verifyPeriodLabel('2026-10-02', '2026-10-08', 'en')).toBe('2–8 Oct 2026');
  });
  it('spans months with both ends named', () => {
    expect(verifyPeriodLabel('2026-09-28', '2026-10-04', 'en')).toBe('28 Sep – 4 Oct 2026');
  });
  it('reads a whole calendar month as "Oct 2026"', () => {
    expect(verifyPeriodLabel('2026-10-01', '2026-10-31', 'en')).toBe('Oct 2026');
  });
});
