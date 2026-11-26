import { describe, it, expect } from 'vitest';
import { restartCadenceYield } from './restartCadence';
import type { ExtractorProgram, ExtractorYieldProgram } from './types';
import { HOUR_MS } from '@/lib/age';

const INSTALL_MS = Date.parse('2026-09-01T00:00:00Z');

const program: ExtractorYieldProgram = {
  pinId: 1,
  installTimeMs: INSTALL_MS,
  expiryTimeMs: INSTALL_MS + 14 * 24 * HOUR_MS,
  qtyPerCycle: 6965,
  cycleTimeMs: 1_800_000,
};

const DAY_H = 24;
const CADENCES_DAYS = [1, 2, 3, 7, 14];
const CADENCES_HOURS = CADENCES_DAYS.map((d) => d * DAY_H);

describe('restartCadenceYield', () => {
  it('returns one entry per requested cadence, carrying the cadence back as `hours`', () => {
    const result = restartCadenceYield({ program, cadences: CADENCES_HOURS });
    expect(result.map((r) => r.hours)).toEqual(CADENCES_HOURS);
  });

  it('scores the best (shortest) cadence at 1.0', () => {
    const result = restartCadenceYield({ program, cadences: CADENCES_HOURS });
    const best = result.find((r) => r.hours === DAY_H);
    expect(best?.relativeToBest).toBe(1);
  });

  const EXPECTED_RATIO_PERCENT: Record<number, number> = {
    1: 100,
    2: 79,
    3: 66,
    7: 42,
    14: 26,
  };

  it("reproduces CCP's restart-cadence table within a few points", () => {
    const result = restartCadenceYield({ program, cadences: CADENCES_HOURS });
    CADENCES_DAYS.forEach((days) => {
      const entry = result.find((r) => r.hours === days * DAY_H);
      const actualPercent = (entry?.relativeToBest ?? 0) * 100;
      expect(actualPercent).toBeGreaterThan(EXPECTED_RATIO_PERCENT[days] - 3);
      expect(actualPercent).toBeLessThan(EXPECTED_RATIO_PERCENT[days] + 3);
    });
  });

  it('prices the cadence, not the length of the program the pilot happened to install', () => {
    const threeDayProgram: ExtractorYieldProgram = {
      ...program,
      expiryTimeMs: INSTALL_MS + 3 * 24 * HOUR_MS,
    };
    const a = restartCadenceYield({ program, cadences: [7 * DAY_H] });
    const b = restartCadenceYield({ program: threeDayProgram, cadences: [7 * DAY_H] });
    expect(a).toEqual(b);
  });

  it('is near-neutral to cycle length alone: a fixed 24 hours yields within a couple percent from 15 minutes to 4 hours', () => {
    const cycleLengthsMs = [
      15 * 60 * 1000,
      30 * 60 * 1000,
      60 * 60 * 1000,
      2 * 60 * 60 * 1000,
      4 * 60 * 60 * 1000,
    ];
    const rates = cycleLengthsMs.map((cycleTimeMs) => {
      const p: ExtractorYieldProgram = { ...program, cycleTimeMs };
      const [entry] = restartCadenceYield({ program: p, cadences: [DAY_H] });
      return entry.unitsPerHour;
    });
    const max = Math.max(...rates);
    const min = Math.min(...rates);
    expect((max - min) / max).toBeLessThan(0.02);
  });

  it('returns an empty result for a program with no install-time baseline, not a default', () => {
    const noBaseline: ExtractorProgram = { pinId: 2, expiryTimeMs: INSTALL_MS + HOUR_MS };
    expect(restartCadenceYield({ program: noBaseline, cadences: CADENCES_HOURS })).toEqual([]);
  });

  it('returns an empty result for an empty cadence list', () => {
    expect(restartCadenceYield({ program, cadences: [] })).toEqual([]);
  });

  it('is zero-rated, not a divide-by-zero, for a cadence shorter than one cycle', () => {
    const result = restartCadenceYield({ program, cadences: [0.1] });
    expect(result).toEqual([{ hours: 0.1, unitsPerHour: 0, relativeToBest: 0 }]);
  });
});
