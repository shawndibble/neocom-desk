import { describe, it, expect } from 'vitest';
import type { PlanBooster } from '@/db';
import {
  DEFAULT_PLAN_BOOSTER,
  MAX_BOOSTER_BONUS,
  clampBoosterBonus,
  boosterExpiryFromInput,
  boosterExpiryToInput,
  normalizePlanBooster,
  resolvePlanBooster,
  toBooster,
} from './planBooster';

const booster = (overrides: Partial<PlanBooster> = {}): PlanBooster => ({
  ...DEFAULT_PLAN_BOOSTER,
  ...overrides,
});

describe('normalizePlanBooster', () => {
  it('is the default when the plan has never had one configured', () => {
    expect(normalizePlanBooster(undefined)).toEqual(DEFAULT_PLAN_BOOSTER);
    expect(DEFAULT_PLAN_BOOSTER).toEqual({ enabled: false, bonus: 3, expiresAt: null });
  });

  it('keeps a well-formed stored booster as it reads', () => {
    const stored = booster({ enabled: true, bonus: 12, expiresAt: 1_700_000_000_000 });
    expect(normalizePlanBooster(stored)).toEqual(stored);
  });

  it('clamps a bonus outside the accelerator range', () => {
    expect(normalizePlanBooster(booster({ bonus: 999 })).bonus).toBe(MAX_BOOSTER_BONUS);
    expect(normalizePlanBooster(booster({ bonus: -4 })).bonus).toBe(0);
    expect(normalizePlanBooster(booster({ bonus: 2.6 })).bonus).toBe(3);
  });

  it('falls back to the default rather than trusting a malformed stored value', () => {
    // Reachable: a doc pulled from Firestore, or a row written by an older build.
    expect(normalizePlanBooster({ enabled: 'yes', bonus: 3, expiresAt: null })).toEqual(
      DEFAULT_PLAN_BOOSTER
    );
    expect(normalizePlanBooster(null)).toEqual(DEFAULT_PLAN_BOOSTER);
    expect(normalizePlanBooster('+3')).toEqual(DEFAULT_PLAN_BOOSTER);
  });

  it('reads a NaN bonus as +0 rather than letting it reach the scheduler', () => {
    expect(normalizePlanBooster({ enabled: false, bonus: Number.NaN, expiresAt: null }).bonus).toBe(
      0
    );
  });

  it('drops an expiry outside the range a Date can name', () => {
    // `Number.isFinite` is not enough: JS instants stop at +/-8.64e15, and
    // anything past that makes an Invalid Date the UI would still render.
    expect(normalizePlanBooster({ enabled: true, bonus: 3, expiresAt: 1e17 }).expiresAt).toBe(null);
    expect(normalizePlanBooster({ enabled: true, bonus: 3, expiresAt: 8.64e15 }).expiresAt).toBe(
      8.64e15
    );
  });

  it('drops an unusable expiry to null', () => {
    expect(normalizePlanBooster({ enabled: true, bonus: 3, expiresAt: Number.NaN }).expiresAt).toBe(
      null
    );
    expect(normalizePlanBooster({ enabled: true, bonus: 3, expiresAt: 'tomorrow' }).expiresAt).toBe(
      null
    );
  });
});

describe('toBooster', () => {
  it('applies the bonus uniformly across all five attributes', () => {
    const expiresAt = Date.UTC(2026, 8, 10, 12, 0, 0);
    expect(toBooster(booster({ enabled: true, bonus: 4, expiresAt }))).toEqual({
      bonus: {
        intelligence: 4,
        memory: 4,
        perception: 4,
        willpower: 4,
        charisma: 4,
      },
      expiresAt: new Date(expiresAt),
    });
  });

  it('is null while the booster is switched off', () => {
    expect(toBooster(booster({ enabled: false, bonus: 4, expiresAt: 1 }))).toBe(null);
  });

  it('is null without an expiry — a booster with no window applies to nothing', () => {
    expect(toBooster(booster({ enabled: true, bonus: 4, expiresAt: null }))).toBe(null);
  });
});

describe('booster expiry <-> datetime-local input', () => {
  it('round-trips an instant through the input value', () => {
    // Built from local parts, because that is what the control edits.
    const instant = new Date(2026, 8, 10, 14, 30).getTime();
    const input = boosterExpiryToInput(instant);
    expect(input).toBe('2026-09-10T14:30');
    expect(boosterExpiryFromInput(input)).toBe(instant);
  });

  it('pads every field so the control accepts the value', () => {
    expect(boosterExpiryToInput(new Date(2026, 0, 2, 3, 4).getTime())).toBe('2026-01-02T03:04');
  });

  it('maps "no expiry" to an empty control and back', () => {
    expect(boosterExpiryToInput(null)).toBe('');
    expect(boosterExpiryFromInput('')).toBe(null);
  });

  it('reads a half-typed or nonsense value as no expiry', () => {
    expect(boosterExpiryFromInput('2026-09')).toBe(null);
    expect(boosterExpiryFromInput('not a date')).toBe(null);
  });
});

describe('resolvePlanBooster', () => {
  it('is what the plan stored, whenever it stored one', () => {
    const stored = booster({ enabled: true, bonus: 4, expiresAt: 1_700_000_000_000 });
    expect(resolvePlanBooster(stored, 12)).toEqual(stored);
  });

  it('prefills a detected accelerator while the plan has stored no answer', () => {
    // The bonus is readable from the sheet; its expiry is not, so the control
    // opens on "nothing is applied yet" and says so.
    expect(resolvePlanBooster(undefined, 12)).toEqual({
      enabled: true,
      bonus: 12,
      expiresAt: null,
    });
  });

  it('does not overrule a stored "no booster" — unticking the box is an answer', () => {
    const answered = booster({ enabled: false, bonus: 12, expiresAt: null });
    expect(resolvePlanBooster(answered, 12)).toEqual(answered);
  });

  it('is the default when nothing is stored and no accelerator is detected', () => {
    expect(resolvePlanBooster(undefined, null)).toEqual(DEFAULT_PLAN_BOOSTER);
  });

  it('normalizes a stored answer rather than trusting it', () => {
    expect(resolvePlanBooster({ enabled: true, bonus: 999, expiresAt: 'soon' }, null)).toEqual({
      enabled: true,
      bonus: MAX_BOOSTER_BONUS,
      expiresAt: null,
    });
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
