import { describe, it, expect } from 'vitest';
import {
  acceleratorBoosters,
  BOOSTER_QUICK_PICKS,
  boosterDurationBase,
  boosterExpiryFromNow,
  clampBoosterBonus,
  joinBoosterDuration,
  MAX_BOOSTER_BONUS,
  splitBoosterDuration,
} from './planBooster';

describe('acceleratorBoosters', () => {
  it('costs a running accelerator as one uniform bonus until its expiry', () => {
    const expiresAt = Date.UTC(2026, 10, 20);
    const [booster, ...rest] = acceleratorBoosters({ bonus: 12, expiresAt });
    expect(rest).toEqual([]);
    expect(booster.expiresAt).toEqual(new Date(expiresAt));
    expect(booster.bonus).toEqual({
      intelligence: 12,
      memory: 12,
      perception: 12,
      willpower: 12,
      charisma: 12,
    });
  });

  it('costs nothing when no accelerator is running', () => {
    expect(acceleratorBoosters(null)).toEqual([]);
    expect(acceleratorBoosters(undefined)).toEqual([]);
  });

  it('clamps a bonus past the supported range', () => {
    const [booster] = acceleratorBoosters({ bonus: 999, expiresAt: 1 });
    expect(booster.bonus.memory).toBe(MAX_BOOSTER_BONUS);
  });
});

describe('booster duration <-> days/hours/minutes', () => {
  const NOW = Date.UTC(2026, 8, 10, 12, 0, 0);
  const MIN = 60 * 1000;

  it('splits the time left into the units EVE shows', () => {
    const expiresAt = NOW + (2 * 24 * 60 + 5 * 60 + 7) * MIN;
    expect(splitBoosterDuration(expiresAt, null, NOW)).toEqual({ days: 2, hours: 5, minutes: 7 });
  });

  it('rounds a part-minute up, so a just-set duration does not read one minute short', () => {
    expect(splitBoosterDuration(NOW + 24 * 60 * MIN - 1000, null, NOW)).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
    });
  });

  it('reads a lapsed expiry as zero', () => {
    expect(splitBoosterDuration(NOW - 5 * MIN, null, NOW)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
    });
  });

  it('measures a queued row from its own start, not from now', () => {
    const start = NOW + 10 * 24 * 60 * MIN;
    expect(splitBoosterDuration(start + 30 * 24 * 60 * MIN, start, NOW).days).toBe(30);
  });

  it('round-trips through joinBoosterDuration', () => {
    const duration = { days: 3, hours: 4, minutes: 5 };
    expect(splitBoosterDuration(NOW + joinBoosterDuration(duration), null, NOW)).toEqual(duration);
  });

  it('counts a start already past as now', () => {
    expect(boosterDurationBase(NOW - 1000, NOW)).toBe(NOW);
    expect(boosterDurationBase(null, NOW)).toBe(NOW);
  });
});

describe('boosterExpiryFromNow', () => {
  const now = Date.UTC(2026, 8, 10, 12, 0, 0);

  it('is now plus the duration, in hours', () => {
    expect(boosterExpiryFromNow(1, null, now)).toBe(now + 60 * 60 * 1000);
    expect(boosterExpiryFromNow(24, null, now)).toBe(now + 24 * 60 * 60 * 1000);
  });

  it('measures from the row’s own future start, not from now', () => {
    const futureStart = Date.UTC(2027, 0, 1);
    expect(boosterExpiryFromNow(1, futureStart, now)).toBe(futureStart + 60 * 60 * 1000);
  });

  it('measures from now when the row’s start has already passed', () => {
    expect(boosterExpiryFromNow(1, now - 1000, now)).toBe(now + 60 * 60 * 1000);
  });
});

describe('BOOSTER_QUICK_PICKS', () => {
  it('is a fixed, ascending list of accelerator durations', () => {
    const hours = BOOSTER_QUICK_PICKS.map((pick) => pick.hours);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    expect(new Set(hours).size).toBe(hours.length);
    expect(hours.length).toBeGreaterThan(0);
  });
});

describe('clampBoosterBonus', () => {
  it('clamps what the input writes, so the stored plan says what it is costed under', () => {
    expect(clampBoosterBonus(45)).toBe(MAX_BOOSTER_BONUS);
    expect(clampBoosterBonus(-3)).toBe(0);
    expect(clampBoosterBonus(2.6)).toBe(3);
    expect(clampBoosterBonus(Number.NaN)).toBe(0);
  });
});
