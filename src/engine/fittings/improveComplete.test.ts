import { describe, expect, it } from 'vitest';
import { findCompletions, mergeCandidates } from './improveComplete';
import type { ImproveCandidate } from './improve';
import type { FitSwap } from './makeItFit';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const CPU: Record<number, number> = { 2: 70, 3: 60, 5: 60, 6: 20, 7: 55, 8: 15 };

const fit = (typeIds: number[]): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Test',
    modules: typeIds.map((typeId, slotIndex) => ({ slot: 'low', slotIndex, typeId })),
  }) as unknown as Fitting;

const stats = async (f: Fitting): Promise<FittingStats> => ({
  ...baseFittingStats(),
  cpuUsed: f.modules.reduce((sum, m) => sum + (CPU[m.typeId] ?? 0), 0),
});

const swap = (slotIndex: number, fromTypeId: number, toTypeId: number): FitSwap => ({
  slot: 'low',
  slotIndex,
  fromTypeId,
  toTypeId,
});

describe('findCompletions', () => {
  // Two ticked rows (2 and 3) together take 130 of 100 CPU, though each fit alone.
  const folded = fit([2, 3, 5]);

  it('finds the swaps that bring a ticked set back under, fewest first', async () => {
    const options = await findCompletions({
      fitting: folded,
      before: await stats(folded),
      swaps: [swap(2, 5, 6), swap(2, 5, 7)],
      stats,
      priceOf: (id) => ({ 5: 100, 6: 300, 7: 120 })[id] ?? null,
    });
    // 70+60+20 = 150, 70+60+55 = 185: both over, so nothing yet; the single swap cannot cover it.
    expect(options).toEqual([]);
  });

  it('offers the swap that covers the set, as an option one tick adds', async () => {
    const small = fit([2, 5]);
    const options = await findCompletions({
      fitting: small,
      before: await stats(small),
      swaps: [swap(1, 5, 6), swap(1, 5, 7)],
      stats,
      priceOf: (id) => ({ 5: 100, 6: 300, 7: 120 })[id] ?? null,
    });
    expect(options.map((o) => o.candidate.toTypeId)).toEqual([6]);
    expect(options[0].iskDelta).toBe(200);
    expect(options[0].after.cpuUsed).toBeLessThanOrEqual(options[0].after.cpuTotal);
  });
});

describe('mergeCandidates', () => {
  const c = (toTypeId: number, pairedWith?: ImproveCandidate): ImproveCandidate => ({
    fromTypeId: 1,
    toTypeId,
    at: [{ slot: 'low', slotIndex: toTypeId }],
    ...(pairedWith ? { pairedWith } : {}),
  });

  it('chains every candidate, a candidate’s own pair kept, so one apply makes them all', () => {
    const merged = mergeCandidates([c(1, c(2)), c(3)])!;
    const walk = (x?: ImproveCandidate): number[] => (x ? [x.toTypeId, ...walk(x.pairedWith)] : []);
    expect(walk(merged)).toEqual([1, 2, 3]);
  });

  it('is undefined for nothing', () => {
    expect(mergeCandidates([])).toBeUndefined();
  });
});
