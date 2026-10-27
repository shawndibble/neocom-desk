import { describe, expect, it } from 'vitest';
import { findFitSwaps, rankFitOptions, type FitSwap } from './makeItFit';
import type { Fitting, FittingStats } from './types';

function stats(over: { cpu?: number; pg?: number; dps?: number; ehp?: number }): FittingStats {
  return {
    cpuUsed: over.cpu ?? 0,
    cpuTotal: 100,
    powergridUsed: over.pg ?? 0,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
    ehp: over.ehp ?? 1000,
    offense: { dps: over.dps ?? 100 },
    navigation: { maxVelocity: 200 },
  } as unknown as FittingStats;
}

function fit(typeIds: number[]): Fitting {
  return {
    modules: typeIds.map((typeId, slotIndex) => ({ slot: 'high', slotIndex, typeId })),
  } as unknown as Fitting;
}

const swap = (slotIndex: number, toTypeId: number): FitSwap => ({
  slot: 'high',
  slotIndex,
  fromTypeId: slotIndex === 0 ? 1 : 2,
  toTypeId,
});

/** CPU/PG per fitted type id; the fit's total is the sum. */
function statsFor(table: Record<number, { cpu: number; pg: number; dps?: number }>) {
  return async (f: Fitting) => {
    const rows = f.modules.map((m) => table[m.typeId]);
    return stats({
      cpu: rows.reduce((s, r) => s + r.cpu, 0),
      pg: rows.reduce((s, r) => s + r.pg, 0),
      dps: rows.reduce((s, r) => s + (r.dps ?? 0), 0),
    });
  };
}

const run = (
  table: Record<number, { cpu: number; pg: number; dps?: number }>,
  candidates: FitSwap[],
  base = fit([1, 2])
) => {
  const calc = statsFor(table);
  return calc(base).then((before) =>
    findFitSwaps({ fitting: base, before, candidates, stats: calc, priceOf: () => null })
  );
};

describe('findFitSwaps', () => {
  it('offers a single swap that brings an over-PG fit under', async () => {
    const table = {
      1: { cpu: 10, pg: 70, dps: 50 },
      2: { cpu: 10, pg: 50, dps: 50 },
      3: { cpu: 10, pg: 40, dps: 45 },
    };
    const result = await run(table, [swap(0, 3)]);
    expect(result.options).toHaveLength(1);
    expect(result.options[0].swaps).toEqual([swap(0, 3)]);
    expect(result.nothingFits).toBe(false);
  });

  it('does not offer a swap too small to clear the overage', async () => {
    const table = {
      1: { cpu: 10, pg: 70 },
      2: { cpu: 10, pg: 50 },
      3: { cpu: 10, pg: 65 },
    };
    const result = await run(table, [swap(0, 3)]);
    expect(result.options).toEqual([]);
    expect(result.nothingFits).toBe(true);
  });

  it('falls back to a pair when no single swap fits', async () => {
    const table = {
      1: { cpu: 10, pg: 70 },
      2: { cpu: 10, pg: 60 },
      3: { cpu: 10, pg: 55 },
      4: { cpu: 10, pg: 45 },
    };
    const result = await run(table, [swap(0, 3), swap(1, 4)]);
    expect(result.options).toHaveLength(1);
    expect(result.options[0].swaps).toHaveLength(2);
  });

  it('clears both CPU and PG when both are over', async () => {
    const table = {
      1: { cpu: 70, pg: 70 },
      2: { cpu: 50, pg: 50 },
      3: { cpu: 40, pg: 80 }, // fixes CPU but not PG
      4: { cpu: 40, pg: 40 },
    };
    const result = await run(table, [swap(0, 3), swap(0, 4)]);
    expect(result.options.map((o) => o.swaps[0].toTypeId)).toEqual([4]);
  });

  it('does nothing for a fit already within budget', async () => {
    const table = { 1: { cpu: 10, pg: 10 }, 2: { cpu: 10, pg: 10 }, 3: { cpu: 5, pg: 5 } };
    const result = await run(table, [swap(0, 3)]);
    expect(result.options).toEqual([]);
    expect(result.nothingFits).toBe(false);
  });
});

describe('rankFitOptions', () => {
  const option = (id: number, dps: number, isk: number | null) => ({
    swaps: [swap(0, id)],
    fitting: fit([id]),
    after: stats({ dps }),
    iskDelta: isk,
  });
  const before = stats({ dps: 100 });

  it('prefers the cheaper swap among those that cost about the same stats', () => {
    const ranked = rankFitOptions(before, [option(1, 96, 5_000_000), option(2, 98, 1_000_000)]);
    expect(ranked.map((o) => o.swaps[0].toTypeId)).toEqual([2, 1]);
  });

  it('keeps a much smaller stat loss ahead of a cheaper swap', () => {
    const ranked = rankFitOptions(before, [option(1, 60, 100), option(2, 99, 9_000_000)]);
    expect(ranked.map((o) => o.swaps[0].toTypeId)).toEqual([2, 1]);
  });

  it('sorts an unpriced swap last within the tolerance', () => {
    const ranked = rankFitOptions(before, [option(1, 99, null), option(2, 98, 1)]);
    expect(ranked.map((o) => o.swaps[0].toTypeId)).toEqual([2, 1]);
  });
});
