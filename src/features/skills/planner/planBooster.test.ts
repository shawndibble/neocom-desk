import { describe, it, expect } from 'vitest';
import {
  acceleratorBoosters,
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
    expect(splitBoosterDuration(expiresAt, NOW)).toEqual({ days: 2, hours: 5, minutes: 7 });
  });

  it('rounds a part-minute up, so a just-set duration does not read one minute short', () => {
    expect(splitBoosterDuration(NOW + 24 * 60 * MIN - 1000, NOW)).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
    });
  });

  it('reads a lapsed expiry as zero', () => {
    expect(splitBoosterDuration(NOW - 5 * MIN, NOW)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
    });
  });

  it('round-trips through joinBoosterDuration', () => {
    const duration = { days: 3, hours: 4, minutes: 5 };
    expect(splitBoosterDuration(NOW + joinBoosterDuration(duration), NOW)).toEqual(duration);
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
