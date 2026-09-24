import { describe, it, expect } from 'vitest';
import { remapAvailability, timedRemapFrom } from './remapAvailability';

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

describe('timedRemapFrom', () => {
  const PLAN_START = new Date('2026-08-29T12:00:00Z');

  it('returns null when there is no ESI data', () => {
    expect(timedRemapFrom(null, PLAN_START)).toBeNull();
  });

  it('returns null when the yearly remap is already off cooldown', () => {
    const info = remapAvailability({ bonus_remaps: 0 }, NOW);
    expect(timedRemapFrom(info, PLAN_START)).toBeNull();
  });

  it('returns null when 2+ bonus remaps already cover the cap (drop the yearly one)', () => {
    const info = remapAvailability(
      { bonus_remaps: 2, accrued_remap_cooldown_date: '2027-01-15T00:00:00Z' },
      NOW
    );
    expect(timedRemapFrom(info, PLAN_START)).toBeNull();
  });

  it('adds one allocation (bonus 0) and the cooldown offset in seconds', () => {
    const info = remapAvailability(
      { bonus_remaps: 0, accrued_remap_cooldown_date: '2026-08-30T12:00:00Z' },
      NOW
    );
    expect(timedRemapFrom(info, PLAN_START)).toEqual({
      remapCount: 1,
      notBeforeSeconds: 86400,
    });
  });

  it('adds one allocation (bonus 1) capped by MAX_SUPPORTED_REMAPS', () => {
    const info = remapAvailability(
      { bonus_remaps: 1, accrued_remap_cooldown_date: '2026-08-30T12:00:00Z' },
      NOW
    );
    expect(timedRemapFrom(info, PLAN_START)).toEqual({
      remapCount: 2,
      notBeforeSeconds: 86400,
    });
  });

  it('floors notBeforeSeconds at 0 when the cooldown has already passed the plan start', () => {
    // yearlyReady is false relative to `now` (fetch time), but the plan
    // starts later than the cooldown itself. Still raises the count — the
    // remap already IS usable by then, so there is nothing left to hold it
    // back for, not nothing left to add.
    const info = remapAvailability(
      { bonus_remaps: 0, accrued_remap_cooldown_date: '2026-08-29T13:00:00Z' },
      NOW
    );
    const laterStart = new Date('2026-08-29T14:00:00Z');
    expect(timedRemapFrom(info, laterStart)).toEqual({ remapCount: 1, notBeforeSeconds: 0 });
  });
});
