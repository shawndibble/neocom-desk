import { describe, expect, it } from 'vitest';
import {
  findImprovements,
  goalAvailability,
  improveCandidates,
  type CandidateOptions,
  type ImproveCandidate,
} from './improve';
import { NO_EXPLORE } from './explore';
import { scoredJobs } from './improveGroups';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingSlotKind, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const index = buildVariationIndex({}, {});

// 1 analyzer, 2 better analyzer, 3 probe launcher, 10 CPU rig (engineering), 11 hacking rig, 12 speed rig, 13 tank rig.
const GROUP: Record<number, number> = {
  1: 538,
  2: 538,
  3: 481,
  10: 781,
  11: 1233,
  12: 782,
  13: 773,
};
const RACK: Record<number, FittingSlotKind> = {
  1: 'high',
  2: 'high',
  3: 'high',
  10: 'rig',
  11: 'rig',
  12: 'rig',
  13: 'rig',
};
const pool: CandidateOptions['pool'] = {
  groupOf: (id) => GROUP[id],
  typeIdsInGroup: (g) =>
    Object.keys(GROUP)
      .map(Number)
      .filter((id) => GROUP[id] === g),
  published: () => true,
};
const options = (over: Partial<CandidateOptions> = {}): Partial<CandidateOptions> => ({
  goal: 'explore',
  reach: 'upgrade',
  includeRigs: true,
  pool,
  ...over,
});

const analyzerFit = (analyzer: number, rig: number): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Explorer',
    modules: [
      { slot: 'high', slotIndex: 0, typeId: analyzer },
      { slot: 'rig', slotIndex: 0, typeId: rig },
    ],
  }) as unknown as Fitting;

/** Strength 60 on analyzer 1, 70 on 2; the hacking rig 11 adds 10; `cpu` is what each rig leaves used. */
function figures(fit: Fitting, cpu: Record<number, number> = {}): FittingStats {
  const [analyzer, rig] = [fit.modules[0]!.typeId, fit.modules[1]!.typeId];
  const base = baseFittingStats();
  return {
    ...base,
    cpuUsed: cpu[rig] ?? 50,
    explore: {
      ...NO_EXPLORE,
      modules: 1,
      hacking: {
        strength: (analyzer === 2 ? 70 : 60) + (rig === 11 ? 10 : 0),
        coherence: 40,
        cycleSeconds: 10,
      },
    },
  };
}

const swap = (fromTypeId: number, toTypeId: number, slot: FittingSlotKind): ImproveCandidate => ({
  fromTypeId,
  toTypeId,
  at: [{ slot, slotIndex: 0 }],
});

describe('Explore better availability', () => {
  it('is disabled with a reason on a fit with no hacking or scanning module', () => {
    expect(goalAvailability('explore', baseFittingStats())).toEqual({
      available: false,
      reason: 'noExplore',
    });
  });

  it('is available once the fit has one', () => {
    const before = { ...baseFittingStats(), explore: { ...NO_EXPLORE, modules: 1 } };
    expect(goalAvailability('explore', before)).toEqual({ available: true });
  });
});

describe('Explore better scoring', () => {
  const run = async (candidates: ImproveCandidate[], cpu?: Record<number, number>) => {
    const fitting = analyzerFit(1, 10);
    return (await findImprovements({
      fitting,
      before: figures(fitting, cpu),
      goal: 'explore',
      candidates,
      stats: async (f) => figures(f, cpu),
      priceOf: () => null,
    }))!;
  };

  it('offers a better analyzer tier as an upgrade', async () => {
    const result = await run([swap(1, 2, 'high')]);
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([2]);
    expect(result.noDownside[0]!.score).toBeGreaterThan(0);
  });

  it('offers a surplus CPU rig swapped for a hacking rig when the fit still fits', async () => {
    const result = await run([{ ...swap(10, 11, 'rig'), dropsResourceRig: true }], { 11: 90 });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([11]);
  });

  it('never offers a CPU rig the fit needs: no row, not even a rejected one', async () => {
    const result = await run([{ ...swap(10, 11, 'rig'), dropsResourceRig: true }], { 11: 140 });
    expect([...result.noDownside, ...result.tradeOffs, ...result.rejected]).toEqual([]);
  });
});

describe('Explore better candidates', () => {
  const modules = [
    { slot: 'high', slotIndex: 0, typeId: 1 },
    { slot: 'high', slotIndex: 1, typeId: 3 },
    { slot: 'rig', slotIndex: 0, typeId: 10 },
    { slot: 'rig', slotIndex: 1, typeId: 13 },
  ] as Fitting['modules'];
  const rigSwaps = (list: ImproveCandidate[]) => list.filter((c) => c.at[0]!.slot === 'rig');

  it('offers a hacking and a speed rig for a CPU rig, flagged, with Include rigs on', () => {
    const list = rigSwaps(improveCandidates(modules, index, RACK, options()));
    const fromCpu = list.filter((c) => c.fromTypeId === 10);
    expect(fromCpu.map((c) => c.toTypeId).sort()).toEqual([11, 12]);
    expect(fromCpu.every((c) => c.dropsResourceRig === true)).toBe(true);
  });

  it('leaves a tank rig alone', () => {
    const list = rigSwaps(improveCandidates(modules, index, RACK, options()));
    expect(list.filter((c) => c.fromTypeId === 13)).toEqual([]);
  });

  it('offers no rig swap with Include rigs off', () => {
    expect(
      rigSwaps(improveCandidates(modules, index, RACK, options({ includeRigs: false })))
    ).toEqual([]);
  });

  it('never drops the last analyzer or probe launcher, even under Rework', () => {
    const list = improveCandidates(modules, index, RACK, options({ reach: 'rework' }));
    const dropped = list.filter(
      (c) =>
        c.fromTypeId !== null &&
        c.at[0]!.slot === 'high' &&
        GROUP[c.fromTypeId] !== GROUP[c.toTypeId]
    );
    expect(dropped).toEqual([]);
    expect(scoredJobs('explore')).toEqual([]);
  });
});
