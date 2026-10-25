import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, type ImproveCandidate } from './improve';
import { jobOf, reworkGroups, scoredJobs } from './improveGroups';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

interface Figures {
  shield?: number;
  armor?: number;
  hull?: number;
  transfer?: number;
  stable?: boolean;
}

function stats({ shield = 0, armor = 0, hull = 0, transfer = 0, stable = true }: Figures) {
  const base = baseFittingStats();
  return {
    ...base,
    capacitor: { ...base.capacitor, stable },
    support: {
      ...base.support,
      remoteRepair: { shield, armor, hull },
      capTransfer: transfer,
    },
  } as FittingStats;
}

const fit = (typeId: number): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Logi',
    modules: [{ slot: 'medium', slotIndex: 0, typeId }],
  }) as unknown as Fitting;

const swap = (toTypeId: number): ImproveCandidate => ({
  fromTypeId: 1,
  toTypeId,
  at: [{ slot: 'medium', slotIndex: 0 }],
});

async function run(goal: 'repair' | 'transfer', figures: Record<number, Figures>) {
  const of = async (f: Fitting) => stats(figures[f.modules[0]!.typeId]!);
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

describe('Repair more goal', () => {
  it('is unavailable with a reason on a fit that repairs no one', () => {
    expect(goalAvailability('repair', stats({}))).toEqual({
      available: false,
      reason: 'noRemoteRepair',
    });
    expect(goalAvailability('repair', stats({ armor: 120 }))).toEqual({ available: true });
    expect(goalAvailability('repair', stats({ hull: 5 }))).toEqual({ available: true });
  });

  it('scores the total HP/s handed out, best first', async () => {
    const result = await run('repair', {
      1: { armor: 100 },
      2: { armor: 120 },
      3: { armor: 150 },
      4: { armor: 80 },
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('adds shield, armor and hull on one scale', async () => {
    const result = await run('repair', {
      1: { shield: 50, armor: 50 },
      2: { shield: 50, armor: 80 },
      3: { shield: 70, armor: 50, hull: 20 },
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('rejects a swap that breaks cap stability, listing it as such', async () => {
    const result = await run('repair', {
      1: { armor: 100 },
      2: { armor: 200, stable: false },
      3: { armor: 120 },
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3]);
    expect(result.rejected.map((o) => [o.candidate.toTypeId, o.guardrail])).toEqual([
      [2, 'capStable'],
    ]);
  });

  it('ignores cap transfer gains', async () => {
    const result = await run('repair', { 1: { armor: 100 }, 2: { armor: 100, transfer: 50 } });
    expect(result.noDownside).toEqual([]);
  });
});

describe('Transfer more goal', () => {
  it('is unavailable with a reason on a fit with no cap transmitter', () => {
    expect(goalAvailability('transfer', stats({ armor: 100 }))).toEqual({
      available: false,
      reason: 'noCapTransfer',
    });
    expect(goalAvailability('transfer', stats({ transfer: 30 }))).toEqual({ available: true });
  });

  it('scores GJ/s handed out, best first', async () => {
    const result = await run('transfer', {
      1: { transfer: 30 },
      2: { transfer: 36 },
      3: { transfer: 45 },
      4: { transfer: 20 },
    });
    expect(result.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
  });

  it('rejects a swap that breaks cap stability, listing it as such', async () => {
    const result = await run('transfer', {
      1: { transfer: 30 },
      2: { transfer: 60, stable: false },
    });
    expect(result.noDownside).toEqual([]);
    expect(result.rejected.map((o) => o.guardrail)).toEqual(['capStable']);
  });
});

describe('logistics Rework groups and jobs', () => {
  it('Repair more tries the remote repair groups; Transfer more the cap transmitter', () => {
    expect(reworkGroups('repair', [])).toEqual(expect.arrayContaining([41, 325, 585]));
    expect(reworkGroups('transfer', [])).toEqual([67]);
  });

  it('protects the last module doing the job the other goal scores', () => {
    expect(jobOf(67)).toBe('capTransfer');
    expect(jobOf(325)).toBe('remoteRepair');
    expect(scoredJobs('repair')).toEqual(['remoteRepair']);
    expect(scoredJobs('transfer')).toEqual(['capTransfer']);
  });
});
