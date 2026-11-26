import { describe, it, expect } from 'vitest';
import {
  extractorCycleYields,
  fractionOfFirstDayRate,
  fractionOfPeak,
  hasYieldBaseline,
  pastEfficientWindow,
  programCycleCount,
  programTotalYield,
  sustainedRatePerHour,
  yieldBankedBy,
} from './extraction';
import type { ExtractorProgram, ExtractorYieldProgram } from './types';
import { DAY_MS, HOUR_MS } from '@/lib/age';

const INSTALL_MS = Date.parse('2026-09-01T00:00:00Z');
const CYCLE_TIME_MS = 1_800_000;
const CYCLES_PER_DAY = 48;

const program: ExtractorYieldProgram = {
  pinId: 1,
  installTimeMs: INSTALL_MS,
  expiryTimeMs: INSTALL_MS + 14 * DAY_MS,
  qtyPerCycle: 6965,
  cycleTimeMs: CYCLE_TIME_MS,
};

const TOTAL_CYCLES = 672;
const sum = (values: readonly number[]) => values.reduce((acc, value) => acc + value, 0);

describe('programCycleCount', () => {
  it('is the install-to-expiry span in whole cycles', () => {
    expect(programCycleCount(program)).toBe(TOTAL_CYCLES);
  });

  it('floors a span that is not a whole number of cycles rather than counting a partial one', () => {
    expect(programCycleCount({ ...program, expiryTimeMs: INSTALL_MS + 2.5 * CYCLE_TIME_MS })).toBe(
      2
    );
  });

  it('is zero for a program whose expiry is not after its install', () => {
    expect(programCycleCount({ ...program, expiryTimeMs: INSTALL_MS })).toBe(0);
  });
});

describe('extractorCycleYields', () => {
  it('returns one entry per requested cycle', () => {
    expect(extractorCycleYields(program, 10)).toHaveLength(10);
  });

  it("matches CCP's reference output at the first and last cycle of a 14-day program", () => {
    const yields = extractorCycleYields(program, TOTAL_CYCLES);
    expect(yields[0]).toBeCloseTo(24_261.65942574787, 6);
    expect(yields[TOTAL_CYCLES - 1]).toBeCloseTo(963.9167969203256, 6);
  });

  it('is not monotonically decreasing — the three cosine terms put bumps in the curve', () => {
    const yields = extractorCycleYields(program, TOTAL_CYCLES);
    const risingSteps = yields.filter((value, index) => index > 0 && value > yields[index - 1]);
    expect(risingSteps.length).toBeGreaterThan(0);
  });

  it('takes the cycle count as an argument, so program length never changes the curve itself', () => {
    const full = extractorCycleYields(program, TOTAL_CYCLES);
    expect(extractorCycleYields(program, CYCLES_PER_DAY)).toEqual(full.slice(0, CYCLES_PER_DAY));
  });

  it('returns nothing for a non-positive cycle count', () => {
    expect(extractorCycleYields(program, 0)).toEqual([]);
    expect(extractorCycleYields(program, -5)).toEqual([]);
  });
});

describe('sustainedRatePerHour', () => {
  it("averages CCP's whole 14-day program into one units-per-hour figure", () => {
    expect(sustainedRatePerHour(program)).toBeCloseTo(1_874_985 / 336, 0);
  });

  it('is two and a half times under what qty_per_cycle alone implies, which is the whole point', () => {
    const naiveRate = program.qtyPerCycle * 2;
    expect(naiveRate).toBe(13_930);
    expect(naiveRate / sustainedRatePerHour(program)).toBeCloseTo(2.4963, 3);
  });

  it('is zero for a program with no whole cycle in it, not a divide-by-zero', () => {
    expect(sustainedRatePerHour({ ...program, expiryTimeMs: program.installTimeMs })).toBe(0);
  });
});

describe('programTotalYield', () => {
  it("totals CCP's published 1,874,985 units across the whole 14-day program", () => {
    expect(Math.round(programTotalYield(program))).toBe(1_874_985);
  });

  it('front-loads the program: day 1 is 513,262 units and day 14 only 45,254', () => {
    const yields = extractorCycleYields(program, TOTAL_CYCLES);
    expect(Math.round(sum(yields.slice(0, CYCLES_PER_DAY)))).toBe(513_262);
    expect(Math.round(sum(yields.slice(CYCLES_PER_DAY * 13)))).toBe(45_254);
  });

  it('does not do naive qty_per_cycle x cycles, which overstates this program by ~150%', () => {
    const naive = program.qtyPerCycle * TOTAL_CYCLES;
    expect(naive).toBe(4_680_480);
    expect(naive / programTotalYield(program)).toBeCloseTo(2.4963, 3);
  });
});

describe('yieldBankedBy', () => {
  it('has banked nothing at install and everything after expiry', () => {
    expect(yieldBankedBy(program, INSTALL_MS)).toBe(0);
    expect(yieldBankedBy(program, INSTALL_MS - DAY_MS)).toBe(0);
    expect(yieldBankedBy(program, program.expiryTimeMs + DAY_MS)).toBeCloseTo(
      programTotalYield(program),
      6
    );
  });

  it('banks a cycle only once it has completed', () => {
    const yields = extractorCycleYields(program, TOTAL_CYCLES);
    expect(yieldBankedBy(program, INSTALL_MS + CYCLE_TIME_MS - 1)).toBe(0);
    expect(yieldBankedBy(program, INSTALL_MS + CYCLE_TIME_MS)).toBeCloseTo(yields[0], 6);
    expect(Math.round(yieldBankedBy(program, INSTALL_MS + DAY_MS))).toBe(513_262);
  });
});

describe('fractionOfPeak', () => {
  it('is 1.0 during the first cycle', () => {
    expect(fractionOfPeak(program, INSTALL_MS)).toBe(1);
    expect(fractionOfPeak(program, INSTALL_MS + CYCLE_TIME_MS - 1)).toBe(1);
    expect(fractionOfPeak(program, INSTALL_MS - DAY_MS)).toBe(1);
  });

  it('is below 0.10 for every cycle of a 14-day program’s last day', () => {
    for (let cycle = CYCLES_PER_DAY * 13; cycle < TOTAL_CYCLES; cycle += 1) {
      expect(fractionOfPeak(program, INSTALL_MS + cycle * CYCLE_TIME_MS)).toBeLessThan(0.1);
    }
  });

  it("holds the final cycle's fraction once the program has expired", () => {
    const atLastCycle = fractionOfPeak(program, program.expiryTimeMs - 1);
    expect(fractionOfPeak(program, program.expiryTimeMs + 10 * DAY_MS)).toBe(atLastCycle);
    expect(atLastCycle).toBeCloseTo(0.03973, 5);
  });
});

const DAILY_RATE_FRACTIONS = [
  1, 0.546724, 0.379254, 0.299579, 0.239838, 0.198292, 0.174904, 0.155818, 0.135307, 0.121558,
  0.11377, 0.104863, 0.095001, 0.088169,
];

describe('fractionOfFirstDayRate', () => {
  it("matches CCP's generator at the close of every day of a 14-day program", () => {
    DAILY_RATE_FRACTIONS.forEach((expected, index) => {
      expect(fractionOfFirstDayRate(program, INSTALL_MS + (index + 1) * DAY_MS)).toBeCloseTo(
        expected,
        5
      );
    });
  });

  it('reads a day flatter than a single cycle does, which is the whole point of it', () => {
    const dayFour = INSTALL_MS + 4 * DAY_MS;
    expect(fractionOfPeak(program, dayFour)).toBeLessThan(0.15);
    expect(fractionOfFirstDayRate(program, dayFour)).toBeCloseTo(0.299579, 5);
  });

  it('reports a full rate through the first day, before any complete day has elapsed', () => {
    expect(fractionOfFirstDayRate(program, INSTALL_MS)).toBe(1);
    expect(fractionOfFirstDayRate(program, INSTALL_MS + 4 * HOUR_MS)).toBe(1);
    expect(fractionOfFirstDayRate(program, INSTALL_MS + DAY_MS - 1)).toBe(1);
    expect(fractionOfFirstDayRate(program, INSTALL_MS - DAY_MS)).toBe(1);
  });

  it("holds an expired program's final day rather than dropping to zero", () => {
    const atExpiry = fractionOfFirstDayRate(program, program.expiryTimeMs);
    expect(atExpiry).toBeCloseTo(0.088169, 5);
    expect(fractionOfFirstDayRate(program, program.expiryTimeMs + 10 * DAY_MS)).toBe(atExpiry);
  });

  it('reports a full rate for a program with no cycles rather than dividing by zero', () => {
    const noCycles = { ...program, expiryTimeMs: INSTALL_MS };
    expect(fractionOfFirstDayRate(noCycles, INSTALL_MS + DAY_MS)).toBe(1);
  });
});

describe('pastEfficientWindow', () => {
  it('is false while the extractor is still at peak', () => {
    expect(pastEfficientWindow(program, INSTALL_MS, 0.5)).toBe(false);
  });

  it('reads the trailing day, not one cycle: still inside the window four hours in', () => {
    expect(pastEfficientWindow(program, INSTALL_MS + 4 * HOUR_MS, 0.5)).toBe(false);
  });

  it('compares strictly against the caller’s threshold', () => {
    expect(pastEfficientWindow(program, INSTALL_MS + 3 * DAY_MS, 0.35)).toBe(false);
    expect(pastEfficientWindow(program, INSTALL_MS + 4 * DAY_MS, 0.35)).toBe(true);
    expect(pastEfficientWindow(program, INSTALL_MS + 4 * DAY_MS, 0.29)).toBe(false);
  });
});

describe('hasYieldBaseline', () => {
  const expiryOnly: ExtractorProgram = { pinId: 2, expiryTimeMs: INSTALL_MS + DAY_MS };

  it('accepts a program carrying every install-time field', () => {
    expect(hasYieldBaseline(program)).toBe(true);
  });

  it('rejects a program that only carries an expiry, so colony health still works without yields', () => {
    expect(hasYieldBaseline(expiryOnly)).toBe(false);
  });

  it('rejects partial or unusable baselines rather than projecting from a substitute', () => {
    expect(hasYieldBaseline({ ...program, qtyPerCycle: undefined })).toBe(false);
    expect(hasYieldBaseline({ ...program, installTimeMs: undefined })).toBe(false);
    expect(hasYieldBaseline({ ...program, cycleTimeMs: undefined })).toBe(false);
    expect(hasYieldBaseline({ ...program, cycleTimeMs: 0 })).toBe(false);
    expect(hasYieldBaseline({ ...program, qtyPerCycle: Number.NaN })).toBe(false);
  });
});
