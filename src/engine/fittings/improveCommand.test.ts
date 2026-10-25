import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, type ImproveCandidate } from './improve';
import { jobOf, reworkGroups, scoredJobs } from './improveGroups';
import { commandOf } from './improveCommand';
import type { BurstRow, CompressionRow, CoreRow } from './fleetSupport';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

interface Support {
  bursts?: Partial<BurstRow>[];
  compressors?: Partial<CompressionRow>[];
  fuel?: number;
}

function stats({ bursts = [], compressors = [], fuel }: Support, stable = true): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    capacitor: { ...base.capacitor, stable },
    fleetSupport: {
      bursts: bursts.map((b) => ({
        typeId: 1,
        count: 1,
        strengths: [10],
        rangeMeters: 30_000,
        durationSeconds: 60,
        reloadSeconds: 30,
        ...b,
      })),
      compressors: compressors.map((c) => ({
        typeId: 2,
        count: 1,
        rangeMeters: 10_000,
        cycleSeconds: 60,
        ...c,
      })),
      core:
        fuel === undefined
          ? null
          : ({ typeId: 3, fuelTypeId: 4, fuelPerCycle: fuel, cycleSeconds: 3600 } as CoreRow),
    },
  } as FittingStats;
}

const fit = (typeId: number): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Command',
    modules: [{ slot: 'high', slotIndex: 0, typeId }],
  }) as unknown as Fitting;

const swap = (toTypeId: number): ImproveCandidate => ({
  fromTypeId: 1,
  toTypeId,
  at: [{ slot: 'high', slotIndex: 0 }],
});

async function run(figures: Record<number, FittingStats>) {
  const of = async (f: Fitting) => figures[f.modules[0]!.typeId]!;
  const base = fit(1);
  const result = await findImprovements({
    fitting: base,
    before: await of(base),
    goal: 'command',
    candidates: Object.keys(figures)
      .map(Number)
      .filter((id) => id !== 1)
      .map(swap),
    stats: of,
    priceOf: () => null,
  });
  return result!;
}

describe('commandOf', () => {
  it("adds each burst's strongest buff, averages burst reach, takes the best compressor and the core fuel", () => {
    expect(
      commandOf(
        stats({
          bursts: [
            { strengths: [20, 10], rangeMeters: 20_000 },
            { strengths: [30], rangeMeters: 40_000, count: 2 },
          ],
          compressors: [{ rangeMeters: 8_000 }, { rangeMeters: 12_000 }],
          fuel: 150,
        })
      )
    ).toEqual({ strength: 50, burstRange: 30_000, compression: 12_000, fuel: 150 });
  });

  it('is zero for a fit that gives its fleet nothing', () => {
    expect(commandOf(stats({}))).toEqual({ strength: 0, burstRange: 0, compression: 0, fuel: 0 });
  });
});

describe('Command goal', () => {
  it('is unavailable with a reason on a fit with no bursts, compressors or core', () => {
    expect(goalAvailability('command', stats({}))).toEqual({
      available: false,
      reason: 'noCommand',
    });
    expect(goalAvailability('command', stats({ bursts: [{}] }))).toEqual({ available: true });
    expect(goalAvailability('command', stats({ compressors: [{}] }))).toEqual({ available: true });
    expect(goalAvailability('command', stats({ fuel: 100 }))).toEqual({ available: true });
  });

  it('is unavailable for a burst with no buff to hand out', () => {
    expect(goalAvailability('command', stats({ bursts: [{ strengths: [] }] }))).toEqual({
      available: false,
      reason: 'noCommand',
    });
  });

  it('scores burst strength, burst reach and compression range, best first', async () => {
    const result = await run({
      1: stats({ bursts: [{ strengths: [10] }], compressors: [{}] }),
      2: stats({ bursts: [{ strengths: [12] }], compressors: [{}] }),
      3: stats({
        bursts: [{ strengths: [12], rangeMeters: 40_000 }],
        compressors: [{ rangeMeters: 12_000 }],
      }),
      4: stats({ bursts: [{ strengths: [8] }], compressors: [{}] }),
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('scores a lower core fuel bill as a gain', async () => {
    const result = await run({
      1: stats({ fuel: 200 }),
      2: stats({ fuel: 150 }),
      3: stats({ fuel: 250 }),
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([2]);
  });

  it('counts a lost core as a loss', async () => {
    const result = await run({
      1: stats({ bursts: [{ strengths: [10] }], fuel: 200 }),
      2: stats({ bursts: [{ strengths: [12] }] }),
    });
    expect(result.noDownside).toEqual([]);
  });

  it('rejects a swap that breaks cap stability', async () => {
    const result = await run({
      1: stats({ bursts: [{ strengths: [10] }] }),
      2: stats({ bursts: [{ strengths: [14] }] }, false),
    });
    expect(result.rejected.map((o) => o.guardrail)).toEqual(['capStable']);
  });
});

describe('Command Rework groups and jobs', () => {
  it('tries command burst, compressor and industrial core groups', () => {
    expect(reworkGroups('command', [])).toEqual(expect.arrayContaining([1770, 4174, 515]));
  });

  it('scores its own job and protects it from the other goals', () => {
    expect(scoredJobs('command')).toEqual(['fleet']);
    expect(jobOf(1770)).toBe('fleet');
    expect(jobOf(4174)).toBe('fleet');
    expect(jobOf(515)).toBe('fleet');
  });
});
