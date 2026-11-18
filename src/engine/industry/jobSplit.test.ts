import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import { splitRuns, splitEffectiveMaterials } from './jobSplit';

const CTX = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'] as const,
  security: 'highsec' as const,
};

const BLUEPRINT: IndustryBlueprint = {
  name: 'Widget Blueprint',
  time: 100,
  materials: [{ typeID: 34, quantity: 7 }],
  products: [{ typeID: 1, quantity: 1 }],
};

describe('splitRuns', () => {
  it('is one job when there is no limit or the runs fit', () => {
    expect(splitRuns(90, undefined)).toEqual([90]);
    expect(splitRuns(40, 40)).toEqual([40]);
    expect(splitRuns(1, 1)).toEqual([1]);
  });

  it('uses the fewest jobs and spreads the runs evenly: 90 at 40 is 30/30/30, not 40/40/10', () => {
    expect(splitRuns(90, 40)).toEqual([30, 30, 30]);
  });

  it('gives the remainder to the first jobs, largest first', () => {
    expect(splitRuns(100, 40)).toEqual([34, 33, 33]);
    expect(splitRuns(5, 1)).toEqual([1, 1, 1, 1, 1]);
  });

  it('never exceeds the limit and never changes the total', () => {
    for (const [runs, limit] of [
      [41, 40],
      [1000, 30],
      [7, 3],
    ]) {
      const jobs = splitRuns(runs, limit);
      expect(jobs.reduce((a, b) => a + b, 0)).toBe(runs);
      expect(Math.max(...jobs)).toBeLessThanOrEqual(limit);
      expect(jobs).toHaveLength(Math.ceil(runs / limit));
    }
  });
});

describe('splitEffectiveMaterials', () => {
  it('matches effectiveMaterials exactly for a single job', () => {
    const split = splitEffectiveMaterials(BLUEPRINT, 30, 10, CTX);
    expect(split.jobRuns).toEqual([30]);
    expect(split.materials).toEqual(effectiveMaterials(BLUEPRINT, 30, 10, CTX));
  });

  it('rounds the material quantity per job, then sums', () => {
    const limited = { ...BLUEPRINT, maxProductionLimit: 10 };
    const split = splitEffectiveMaterials(limited, 25, 10, CTX);
    expect(split.jobRuns).toEqual([9, 8, 8]);
    const perJob = split.jobRuns.map((r) => effectiveMaterials(limited, r, 10, CTX)[0].quantity);
    expect(split.materials).toEqual([
      {
        typeID: 34,
        baseQuantity: 7 * 25,
        quantity: perJob.reduce((a, b) => a + b, 0),
      },
    ]);
  });
});
