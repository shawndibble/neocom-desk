import { describe, it, expect } from 'vitest';
import type { PlanBooster } from '@/db';
import {
  BOOSTER_QUICK_PICKS,
  DEFAULT_PLAN_BOOSTER,
  MAX_BOOSTER_BONUS,
  clampBoosterBonus,
  clampBoosterOverlaps,
  hasOverlappingBoosters,
  boosterExpiryFromInput,
  boosterExpiryFromNow,
  boosterExpiryToInput,
  normalizePlanBoosterRow,
  normalizePlanBoosters,
  resolvePlanBoosters,
  toBoosters,
} from './planBooster';

const booster = (overrides: Partial<PlanBooster> = {}): PlanBooster => ({
  ...DEFAULT_PLAN_BOOSTER,
  ...overrides,
});

describe('normalizePlanBoosterRow', () => {
  it('is the default for a value that is not a booster row at all', () => {
    expect(normalizePlanBoosterRow(undefined)).toEqual(DEFAULT_PLAN_BOOSTER);
    expect(DEFAULT_PLAN_BOOSTER).toEqual({
      enabled: false,
      bonus: 3,
      startsAt: null,
      expiresAt: null,
    });
  });

  it('keeps a well-formed stored row as it reads', () => {
    const stored = booster({
      enabled: true,
      bonus: 12,
      startsAt: 1_699_000_000_000,
      expiresAt: 1_700_000_000_000,
    });
    expect(normalizePlanBoosterRow(stored)).toEqual(stored);
  });

  it('clamps a bonus outside the accelerator range', () => {
    expect(normalizePlanBoosterRow(booster({ bonus: 999 })).bonus).toBe(MAX_BOOSTER_BONUS);
    expect(normalizePlanBoosterRow(booster({ bonus: -4 })).bonus).toBe(0);
    expect(normalizePlanBoosterRow(booster({ bonus: 2.6 })).bonus).toBe(3);
  });

  it('falls back to the default rather than trusting a malformed stored value', () => {
    expect(normalizePlanBoosterRow({ enabled: 'yes', bonus: 3, expiresAt: null })).toEqual(
      DEFAULT_PLAN_BOOSTER
    );
    expect(normalizePlanBoosterRow(null)).toEqual(DEFAULT_PLAN_BOOSTER);
    expect(normalizePlanBoosterRow('+3')).toEqual(DEFAULT_PLAN_BOOSTER);
  });

  it('reads a NaN bonus as +0 rather than letting it reach the scheduler', () => {
    expect(
      normalizePlanBoosterRow({ enabled: false, bonus: Number.NaN, expiresAt: null }).bonus
    ).toBe(0);
  });

  it('drops an instant outside the range a Date can name, for either field', () => {
    expect(
      normalizePlanBoosterRow({ enabled: true, bonus: 3, startsAt: 1e17, expiresAt: 8.64e15 })
        .startsAt
    ).toBe(null);
    expect(
      normalizePlanBoosterRow({ enabled: true, bonus: 3, startsAt: 8.64e15, expiresAt: 1e17 })
        .expiresAt
    ).toBe(null);
  });

  it('drops an unusable instant to null, for either field', () => {
    expect(
      normalizePlanBoosterRow({ enabled: true, bonus: 3, startsAt: Number.NaN, expiresAt: null })
        .startsAt
    ).toBe(null);
    expect(
      normalizePlanBoosterRow({ enabled: true, bonus: 3, startsAt: 'now', expiresAt: null })
        .startsAt
    ).toBe(null);
  });

  it('defaults an absent startsAt to null ("already running")', () => {
    expect(normalizePlanBoosterRow({ enabled: true, bonus: 3, expiresAt: 1000 }).startsAt).toBe(
      null
    );
  });
});

describe('clampBoosterOverlaps', () => {
  it('leaves non-overlapping rows untouched', () => {
    const rows = [
      booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: true, bonus: 4, startsAt: 1000, expiresAt: 2000 }),
    ];
    expect(clampBoosterOverlaps(rows)).toEqual(rows);
  });

  it('sorts unsorted rows ascending by start', () => {
    const later = booster({ enabled: true, bonus: 4, startsAt: 1000, expiresAt: 2000 });
    const earlier = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    expect(clampBoosterOverlaps([later, earlier])).toEqual([earlier, later]);
  });

  it('pulls a later row forward to the previous row’s expiry when they overlap', () => {
    const first = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    const overlapping = booster({ enabled: true, bonus: 4, startsAt: 500, expiresAt: 2000 });
    const [, clamped] = clampBoosterOverlaps([first, overlapping]);
    expect(clamped.startsAt).toBe(1000);
    expect(clamped.expiresAt).toBe(2000);
  });

  it('leaves a row entirely swallowed by an earlier one with a start at or past its own expiry', () => {
    const outer = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    const swallowed = booster({ enabled: true, bonus: 4, startsAt: 200, expiresAt: 500 });
    const [, clamped] = clampBoosterOverlaps([outer, swallowed]);
    expect(clamped.startsAt).toBeGreaterThanOrEqual(clamped.expiresAt!);
  });

  it('does not clamp against a disabled row', () => {
    const disabled = booster({ enabled: false, bonus: 3, startsAt: null, expiresAt: 1000 });
    const row = booster({ enabled: true, bonus: 4, startsAt: 500, expiresAt: 2000 });
    const [, clamped] = clampBoosterOverlaps([disabled, row]);
    expect(clamped).toEqual(row);
  });

  it('does not clamp against a row with no expiry yet', () => {
    const noExpiry = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: null });
    const row = booster({ enabled: true, bonus: 4, startsAt: 500, expiresAt: 2000 });
    const [, clamped] = clampBoosterOverlaps([noExpiry, row]);
    expect(clamped).toEqual(row);
  });

  it('chains three back-to-back rows, each clamped against the running frontier', () => {
    const a = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    const b = booster({ enabled: true, bonus: 4, startsAt: 500, expiresAt: 1500 });
    const c = booster({ enabled: true, bonus: 5, startsAt: 800, expiresAt: 2500 });
    const [ra, rb, rc] = clampBoosterOverlaps([a, b, c]);
    expect(ra.startsAt).toBe(null);
    expect(rb.startsAt).toBe(1000);
    expect(rc.startsAt).toBe(1500);
  });
});

describe('hasOverlappingBoosters', () => {
  it('is false for an empty or single-row list', () => {
    expect(hasOverlappingBoosters([])).toBe(false);
    expect(hasOverlappingBoosters([booster({ enabled: true, expiresAt: 1000 })])).toBe(false);
  });

  it('is false for back-to-back rows sharing a boundary instant', () => {
    const rows = [
      booster({ enabled: true, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: true, startsAt: 1000, expiresAt: 2000 }),
    ];
    expect(hasOverlappingBoosters(rows)).toBe(false);
  });

  it('is true when a later row starts before an earlier one expires', () => {
    const rows = [
      booster({ enabled: true, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: true, startsAt: 500, expiresAt: 2000 }),
    ];
    expect(hasOverlappingBoosters(rows)).toBe(true);
  });

  it('ignores a disabled row', () => {
    const rows = [
      booster({ enabled: true, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: false, startsAt: 500, expiresAt: 2000 }),
    ];
    expect(hasOverlappingBoosters(rows)).toBe(false);
  });

  it('ignores a row with no expiry yet', () => {
    const rows = [
      booster({ enabled: true, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: true, startsAt: 500, expiresAt: null }),
    ];
    expect(hasOverlappingBoosters(rows)).toBe(false);
  });
});

describe('normalizePlanBoosters', () => {
  it('reads the boosters list when present, ignoring any legacy value', () => {
    const rows = [booster({ enabled: true, bonus: 4, expiresAt: 1000 })];
    expect(normalizePlanBoosters(rows, booster({ enabled: true, bonus: 9 }))).toEqual(rows);
  });

  it('is an empty list for an explicit empty boosters array', () => {
    expect(normalizePlanBoosters([], booster({ enabled: true }))).toEqual([]);
  });

  it('wraps a legacy single booster into a one-element list when boosters is absent', () => {
    const legacy = booster({ enabled: true, bonus: 7, expiresAt: 5000 });
    expect(normalizePlanBoosters(undefined, legacy)).toEqual([legacy]);
  });

  it('is empty when both boosters and legacy are absent', () => {
    expect(normalizePlanBoosters(undefined, undefined)).toEqual([]);
  });

  it('clamps overlaps in the resulting list', () => {
    const rows = [
      booster({ enabled: true, startsAt: null, expiresAt: 1000 }),
      booster({ enabled: true, startsAt: 500, expiresAt: 2000 }),
    ];
    expect(hasOverlappingBoosters(normalizePlanBoosters(rows))).toBe(false);
  });
});

describe('toBoosters', () => {
  it('applies the bonus uniformly across all five attributes', () => {
    const expiresAt = Date.UTC(2026, 8, 10, 12, 0, 0);
    expect(toBoosters([booster({ enabled: true, bonus: 4, expiresAt })])).toEqual([
      {
        bonus: { intelligence: 4, memory: 4, perception: 4, willpower: 4, charisma: 4 },
        expiresAt: new Date(expiresAt),
      },
    ]);
  });

  it('carries startsAt through when set', () => {
    const startsAt = Date.UTC(2026, 8, 9);
    const expiresAt = Date.UTC(2026, 8, 10);
    const [result] = toBoosters([booster({ enabled: true, bonus: 4, startsAt, expiresAt })]);
    expect(result.startsAt).toEqual(new Date(startsAt));
  });

  it('omits startsAt entirely when null, rather than a Date of null', () => {
    const [result] = toBoosters([
      booster({ enabled: true, bonus: 4, startsAt: null, expiresAt: 1000 }),
    ]);
    expect(result.startsAt).toBeUndefined();
  });

  it('skips a disabled row', () => {
    expect(toBoosters([booster({ enabled: false, bonus: 4, expiresAt: 1 })])).toEqual([]);
  });

  it('skips a row with no expiry — a Booster with no window applies to nothing', () => {
    expect(toBoosters([booster({ enabled: true, bonus: 4, expiresAt: null })])).toEqual([]);
  });

  it('skips a row fully swallowed by an earlier one after clamping', () => {
    const outer = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    const swallowed = booster({ enabled: true, bonus: 4, startsAt: 200, expiresAt: 500 });
    expect(toBoosters([outer, swallowed])).toHaveLength(1);
  });

  it('returns one Booster per surviving row, in start order', () => {
    const a = booster({ enabled: true, bonus: 3, startsAt: null, expiresAt: 1000 });
    const b = booster({ enabled: true, bonus: 4, startsAt: 1000, expiresAt: 2000 });
    const result = toBoosters([b, a]);
    expect(result).toHaveLength(2);
    expect(result[0].expiresAt).toEqual(new Date(1000));
    expect(result[1].expiresAt).toEqual(new Date(2000));
  });
});

describe('booster instant <-> datetime-local input', () => {
  it('round-trips an instant through the input value', () => {
    const instant = new Date(2026, 8, 10, 14, 30).getTime();
    const input = boosterExpiryToInput(instant);
    expect(input).toBe('2026-09-10T14:30');
    expect(boosterExpiryFromInput(input)).toBe(instant);
  });

  it('pads every field so the control accepts the value', () => {
    expect(boosterExpiryToInput(new Date(2026, 0, 2, 3, 4).getTime())).toBe('2026-01-02T03:04');
  });

  it('maps "no instant" to an empty control and back', () => {
    expect(boosterExpiryToInput(null)).toBe('');
    expect(boosterExpiryFromInput('')).toBe(null);
  });

  it('reads a half-typed or nonsense value as no instant', () => {
    expect(boosterExpiryFromInput('2026-09')).toBe(null);
    expect(boosterExpiryFromInput('not a date')).toBe(null);
  });
});

describe('resolvePlanBoosters', () => {
  it('is what the plan stored, whenever it stored either field', () => {
    const stored = [booster({ enabled: true, bonus: 4, expiresAt: 1_700_000_000_000 })];
    expect(resolvePlanBoosters(stored, undefined, 12)).toEqual(stored);
  });

  it('prefills a single detected accelerator while the plan has answered neither field', () => {
    expect(resolvePlanBoosters(undefined, undefined, 12)).toEqual([
      { enabled: true, bonus: 12, startsAt: null, expiresAt: null },
    ]);
  });

  it('does not overrule a stored empty list — removing every row is an answer', () => {
    expect(resolvePlanBoosters([], undefined, 12)).toEqual([]);
  });

  it('does not overrule a stored legacy "no booster" — unticking the box is an answer', () => {
    const answered = booster({ enabled: false, bonus: 12, expiresAt: null });
    expect(resolvePlanBoosters(undefined, answered, 12)).toEqual([answered]);
  });

  it('is empty when nothing is stored and no accelerator is detected', () => {
    expect(resolvePlanBoosters(undefined, undefined, null)).toEqual([]);
  });

  it('normalizes a stored answer rather than trusting it', () => {
    expect(
      resolvePlanBoosters([{ enabled: true, bonus: 999, expiresAt: 'soon' }], undefined, null)
    ).toEqual([{ enabled: true, bonus: MAX_BOOSTER_BONUS, startsAt: null, expiresAt: null }]);
  });
});

describe('boosterExpiryFromNow', () => {
  it('is now plus the duration, in hours', () => {
    const now = Date.UTC(2026, 8, 10, 12, 0, 0);
    expect(boosterExpiryFromNow(1, now)).toBe(now + 60 * 60 * 1000);
    expect(boosterExpiryFromNow(24, now)).toBe(now + 24 * 60 * 60 * 1000);
  });

  it('measures from a given instant, not necessarily now — a row with its own future start', () => {
    const futureStart = Date.UTC(2027, 0, 1);
    expect(boosterExpiryFromNow(1, futureStart)).toBe(futureStart + 60 * 60 * 1000);
  });

  it('defaults to the real clock when no instant is given', () => {
    const before = Date.now();
    const result = boosterExpiryFromNow(1);
    expect(result).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
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
