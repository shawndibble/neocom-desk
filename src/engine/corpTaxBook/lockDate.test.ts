import { describe, expect, it } from 'vitest';
import { isLocked } from './lockDate';

describe('isLocked (decision 20261120-235011, "a lock date")', () => {
  it('locks what is dated before the 1st of the month two months back', () => {
    // On 1 Dec and on 15 Dec alike the lock date is 1 Oct.
    for (const today of ['2026-12-01', '2026-12-15T23:00:00Z']) {
      expect(isLocked('2026-09-30', today)).toBe(true);
      expect(isLocked('2026-10-01', today)).toBe(false);
    }
  });

  it('reads an instant by its UTC day', () => {
    expect(isLocked('2026-09-30T23:59:59Z', '2026-12-01')).toBe(true);
    expect(isLocked('2026-10-01T00:00:00Z', '2026-12-01')).toBe(false);
  });

  it('rolls over a year', () => {
    expect(isLocked('2026-10-31', '2027-01-05')).toBe(true);
    expect(isLocked('2026-11-01', '2027-01-05')).toBe(false);
  });
});
