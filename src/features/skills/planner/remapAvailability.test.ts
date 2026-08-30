import { describe, it, expect } from 'vitest';
import { remapAvailability } from './remapAvailability';

const NOW = new Date('2026-08-29T12:00:00Z');

describe('remapAvailability', () => {
  it('returns zero/none when there is no ESI data', () => {
    expect(remapAvailability(null, NOW)).toBeNull();
    expect(remapAvailability(undefined, NOW)).toBeNull();
  });

  it('counts the yearly remap as available when no cooldown date is present', () => {
    const result = remapAvailability({ bonus_remaps: 2 }, NOW);
    expect(result).toEqual({ available: 3, bonus: 2, yearlyReady: true, cooldownUntil: null });
  });

  it('counts the yearly remap when the cooldown date is in the past', () => {
    const result = remapAvailability(
      { bonus_remaps: 0, accrued_remap_cooldown_date: '2026-08-29T11:59:59Z' },
      NOW
    );
    expect(result).toMatchObject({ available: 1, bonus: 0, yearlyReady: true });
    expect(result?.cooldownUntil).toEqual(new Date('2026-08-29T11:59:59Z'));
  });

  it('withholds the yearly remap while the cooldown date is in the future', () => {
    const result = remapAvailability(
      { bonus_remaps: 1, accrued_remap_cooldown_date: '2027-01-15T00:00:00Z' },
      NOW
    );
    expect(result).toEqual({
      available: 1,
      bonus: 1,
      yearlyReady: false,
      cooldownUntil: new Date('2027-01-15T00:00:00Z'),
    });
  });

  it('treats a missing bonus_remaps as zero and an unparseable cooldown as ready', () => {
    const result = remapAvailability({ accrued_remap_cooldown_date: 'not-a-date' }, NOW);
    expect(result).toEqual({ available: 1, bonus: 0, yearlyReady: true, cooldownUntil: null });
  });
});
