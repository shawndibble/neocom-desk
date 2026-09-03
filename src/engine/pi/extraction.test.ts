import { describe, it, expect } from 'vitest';
import {
  extractorCycleYields,
  fractionOfPeak,
  hasYieldBaseline,
  pastEfficientWindow,
  programCycleCount,
  programTotalYield,
  yieldBankedBy,
  yieldRemaining,
} from './extraction';
import type { ExtractorProgram, ExtractorYieldProgram } from './types';

const DAY_MS = 86_400_000;
const INSTALL_MS = Date.parse('2026-09-01T00:00:00Z');
const CYCLE_TIME_MS = 1_800_000; // ESI's cycle_time 1800 s
const CYCLES_PER_DAY = 48;

/**
 * CCP's worked example: qty_per_cycle 6,965 on a 30-minute cycle, run for 14
 * days. Every expected number below is a literal produced by running CCP's
 * reference generator (https://developers.eveonline.com/docs/guides/pi/), not
 * derived from this module — a shared mistake between test and implementation
 * would otherwise agree with itself.
 */
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
    // A "simplified" curve of decay alone (qty / (1 + t * 0.012)) is strictly
    // decreasing, so a single rising step is proof the noise term survived.
    const yields = extractorCycleYields(program, TOTAL_CYCLES);
    const risingSteps = yields.filter((value, index) => index > 0 && value > yields[index - 1]);
    expect(risingSteps.length).toBeGreaterThan(0);
  });

  it('takes the cycle count as an argument, so program length never changes the curve itself', () => {
    // A shorter program off the same install-time baseline reproduces the
    // longer one's opening cycles exactly; nothing is inferred from the
    // program's own duration beyond how many cycles to walk.
    const full = extractorCycleYields(program, TOTAL_CYCLES);
    expect(extractorCycleYields(program, CYCLES_PER_DAY)).toEqual(full.slice(0, CYCLES_PER_DAY));
  });

  it('returns nothing for a non-positive cycle count', () => {
    expect(extractorCycleYields(program, 0)).toEqual([]);
    expect(extractorCycleYields(program, -5)).toEqual([]);
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

describe('yieldBankedBy / yieldRemaining', () => {
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

  it('splits the program total at every point in time', () => {
    const total = programTotalYield(program);
    for (const nowMs of [
      INSTALL_MS - DAY_MS,
      INSTALL_MS,
      INSTALL_MS + 3 * DAY_MS,
      program.expiryTimeMs,
      program.expiryTimeMs + DAY_MS,
    ]) {
      expect(yieldBankedBy(program, nowMs) + yieldRemaining(program, nowMs)).toBeCloseTo(total, 6);
    }
  });

  it('has nothing left after expiry', () => {
    expect(yieldRemaining(program, program.expiryTimeMs)).toBeCloseTo(0, 6);
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

describe('pastEfficientWindow', () => {
  it('is false while the extractor is still at peak', () => {
    expect(pastEfficientWindow(program, INSTALL_MS, 0.5)).toBe(false);
  });

  it('compares strictly against the caller’s threshold', () => {
    // Day 7 sits at 0.0633 of peak.
    const daySeven = INSTALL_MS + 7 * DAY_MS;
    expect(fractionOfPeak(program, daySeven)).toBeCloseTo(0.06326, 5);
    expect(pastEfficientWindow(program, daySeven, 0.07)).toBe(true);
    expect(pastEfficientWindow(program, daySeven, 0.06)).toBe(false);
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
