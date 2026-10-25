import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, type ImproveCandidate } from './improve';
import { jobOf, reworkGroups, scoredJobs } from './improveGroups';
import { ewarOf, tackleOf } from './improveTackle';
import type { SupportRow } from './support';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

type Row = Pick<SupportRow, 'kind' | 'amount'> & Partial<SupportRow>;

function stats(rows: Row[], stable = true): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    capacitor: { ...base.capacitor, stable },
    support: {
      ...base.support,
      rows: rows.map((r) => ({
        typeId: 1,
        count: 1,
        optimal: 10_000,
        falloff: 0,
        effects: [],
        ...r,
      })),
    },
  } as FittingStats;
}

const scram = (amount: number, optimal = 9_000): Row => ({
  kind: 'warpDisruption',
  amount,
  optimal,
});
const web = (amount: number, optimal = 10_000): Row => ({ kind: 'web', amount, optimal });
const ecm = (amount: number, count = 1, optimal = 20_000): Row => ({
  kind: 'ecm',
  amount,
  count,
  optimal,
});

const fit = (typeId: number): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Tackle',
    modules: [{ slot: 'medium', slotIndex: 0, typeId }],
  }) as unknown as Fitting;

const swap = (toTypeId: number): ImproveCandidate => ({
  fromTypeId: 1,
  toTypeId,
  at: [{ slot: 'medium', slotIndex: 0 }],
});

async function run(goal: 'tackle' | 'ewar', figures: Record<number, FittingStats>) {
  const of = async (f: Fitting) => figures[f.modules[0]!.typeId]!;
  const base = fit(1);
  const result = await findImprovements({
    fitting: base,
    before: await of(base),
    goal,
    candidates: Object.keys(figures)
      .map(Number)
      .filter((id) => id !== 1)
      .map(swap),
    stats: of,
    priceOf: () => null,
  });
  return result!;
}

describe('tackleOf', () => {
  it('adds scram and disruptor points, takes the best web and the shortest reach', () => {
    expect(tackleOf(stats([scram(2), scram(3, 12_000), web(50, 14_000), web(60, 8_000)]))).toEqual({
      points: 5,
      web: 60,
      range: 8_000,
    });
  });

  it('is zero for a fit with no tackle', () => {
    expect(tackleOf(stats([ecm(3)]))).toEqual({ points: 0, web: 0, range: 0 });
  });
});

describe('ewarOf', () => {
  it('adds strength across modules and averages reach weighted by module count', () => {
    const rows: Row[] = [
      ecm(4, 2, 20_000),
      { kind: 'targetPainter', amount: 30, optimal: 40_000, falloff: 20_000 },
      scram(2),
    ];
    expect(ewarOf(stats(rows))).toEqual({ strength: 38, range: (2 * 20_000 + 60_000) / 3 });
  });

  it('is zero for a fit with no electronic warfare', () => {
    expect(ewarOf(stats([scram(2), web(50)]))).toEqual({ strength: 0, range: 0 });
  });
});

describe('Hold tighter goal', () => {
  it('is unavailable with a reason on a fit with no scram, disruptor or web', () => {
    expect(goalAvailability('tackle', stats([ecm(3)]))).toEqual({
      available: false,
      reason: 'noTackle',
    });
    expect(goalAvailability('tackle', stats([web(50)]))).toEqual({ available: true });
    expect(goalAvailability('tackle', stats([scram(2)]))).toEqual({ available: true });
  });

  it('scores points, web slowdown and range together, best first', async () => {
    const result = await run('tackle', {
      1: stats([scram(2), web(50)]),
      2: stats([scram(3), web(50)]),
      3: stats([scram(3), web(60, 12_000)]),
      4: stats([scram(1), web(50)]),
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('counts a lost web as a loss', async () => {
    const result = await run('tackle', {
      1: stats([scram(2), web(50)]),
      2: stats([scram(3)]),
    });
    expect(result.noDownside).toEqual([]);
  });

  it('rejects a swap that breaks cap stability', async () => {
    const result = await run('tackle', {
      1: stats([scram(2)]),
      2: stats([scram(4)], false),
    });
    expect(result.rejected.map((o) => o.guardrail)).toEqual(['capStable']);
  });

  it('ignores electronic warfare gains', async () => {
    const result = await run('tackle', {
      1: stats([scram(2), ecm(3)]),
      2: stats([scram(2), ecm(9)]),
    });
    expect(result.noDownside).toEqual([]);
  });
});

describe('Stronger EWAR goal', () => {
  it('is unavailable with a reason on a fit with no electronic warfare', () => {
    expect(goalAvailability('ewar', stats([scram(2), web(50)]))).toEqual({
      available: false,
      reason: 'noEwar',
    });
    expect(goalAvailability('ewar', stats([ecm(3)]))).toEqual({ available: true });
  });

  it('scores module strength and range, best first', async () => {
    const result = await run('ewar', {
      1: stats([ecm(4)]),
      2: stats([ecm(5)]),
      3: stats([ecm(5, 1, 30_000)]),
      4: stats([ecm(3)]),
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('ignores scram and web gains', async () => {
    const result = await run('ewar', {
      1: stats([ecm(4), scram(2)]),
      2: stats([ecm(4), scram(5)]),
    });
    expect(result.noDownside).toEqual([]);
  });
});

describe('tackle and EWAR Rework groups and jobs', () => {
  it('Hold tighter tries scram and web groups; Stronger EWAR the EWAR ones', () => {
    expect(reworkGroups('tackle', [])).toEqual(expect.arrayContaining([52, 65]));
    expect(reworkGroups('ewar', [])).toEqual(expect.arrayContaining([201, 208, 291, 379]));
  });

  it('each goal scores its own jobs and protects the other', () => {
    expect(scoredJobs('tackle')).toEqual(['scram', 'web']);
    expect(scoredJobs('ewar')).toEqual(['ewar']);
    expect(jobOf(52)).toBe('scram');
    expect(jobOf(201)).toBe('ewar');
    // Neutralizers are not scored by Stronger EWAR, so losing the last one stays guarded.
    expect(jobOf(71)).not.toBe('ewar');
    expect(jobOf(71)).not.toBeNull();
  });
});
