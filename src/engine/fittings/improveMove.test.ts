import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, type ImproveCandidate } from './improve';
import { alignTimeSeconds } from './stats';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats, NO_HOLDS } from './__fixtures__/fittingStats';

function stats(patch: {
  holds?: Partial<FittingStats['holds']>;
  mass?: number;
  agility?: number;
  warpSpeed?: number;
}): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    holds: { ...NO_HOLDS, ...patch.holds },
    navigation: {
      ...base.navigation,
      mass: patch.mass ?? base.navigation.mass,
      agility: patch.agility ?? base.navigation.agility,
      warpSpeed: patch.warpSpeed ?? base.navigation.warpSpeed,
    },
  };
}

const fit = (typeId: number): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Hauler',
    modules: [{ slot: 'low', slotIndex: 0, typeId }],
  }) as unknown as Fitting;

const swap = (toTypeId: number): ImproveCandidate => ({
  fromTypeId: 1,
  toTypeId,
  at: [{ slot: 'low', slotIndex: 0 }],
});

async function run(
  goal: 'haul' | 'align' | 'warp',
  figures: Record<number, Parameters<typeof stats>[0]>,
  hold?: Parameters<typeof findImprovements>[0]['hold']
) {
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
    ...(hold ? { hold } : {}),
  });
  return result!.noDownside.map((o) => o.candidate.toTypeId);
}

describe('Carry more goal', () => {
  it('is unavailable with a reason on a hull with no hold', () => {
    expect(goalAvailability('haul', stats({}))).toEqual({ available: false, reason: 'noHold' });
    expect(goalAvailability('haul', stats({ holds: { cargo: 100 } }))).toEqual({
      available: true,
    });
    expect(goalAvailability('haul', stats({ holds: { miningHold: 5000 } }))).toEqual({
      available: true,
    });
  });

  it('scores the hold the pilot picks, best first, and drops swaps that shrink it', async () => {
    const figures = {
      1: { holds: { cargo: 1000, iceHold: 500 } },
      2: { holds: { cargo: 1200, iceHold: 500 } },
      3: { holds: { cargo: 1500, iceHold: 500 } },
      4: { holds: { cargo: 900, iceHold: 500 } },
      5: { holds: { cargo: 1000, iceHold: 800 } },
    };
    expect(await run('haul', figures, 'cargo')).toEqual([3, 2]);
    expect(await run('haul', figures, 'iceHold')).toEqual([5]);
  });

  it('defaults to the cargo hold', async () => {
    const figures = {
      1: { holds: { cargo: 1000 } },
      2: { holds: { cargo: 1100 } },
    };
    expect(await run('haul', figures)).toEqual([2]);
  });
});

describe('Align faster goal', () => {
  it('is unavailable with a reason on a hull with no mass or agility', () => {
    expect(goalAvailability('align', stats({ agility: 0 }))).toEqual({
      available: false,
      reason: 'noAlign',
    });
    expect(goalAvailability('align', stats({}))).toEqual({ available: true });
  });

  it('scores the cut in align time, lower mass or agility winning', async () => {
    const figures = {
      1: { agility: 4, mass: 10_000_000 },
      2: { agility: 3, mass: 10_000_000 },
      3: { agility: 4, mass: 6_000_000 },
      4: { agility: 5, mass: 10_000_000 },
    };
    expect(alignTimeSeconds(6_000_000, 4)).toBeLessThan(alignTimeSeconds(10_000_000, 3));
    expect(await run('align', figures)).toEqual([3, 2]);
  });

  it('ignores a warp speed gain', async () => {
    const figures = { 1: { warpSpeed: 3 }, 2: { warpSpeed: 4 } };
    expect(await run('align', figures)).toEqual([]);
  });
});

describe('Align and warp faster goal', () => {
  it('is unavailable with a reason on a hull with no warp speed', () => {
    expect(goalAvailability('warp', stats({ warpSpeed: 0 }))).toEqual({
      available: false,
      reason: 'noWarp',
    });
    expect(goalAvailability('warp', stats({ agility: 0 }))).toEqual({
      available: false,
      reason: 'noWarp',
    });
    expect(goalAvailability('warp', stats({}))).toEqual({ available: true });
  });

  it('adds the align gain and the warp speed gain', async () => {
    const figures = {
      1: { agility: 4, warpSpeed: 3 },
      2: { agility: 4, warpSpeed: 3.6 },
      3: { agility: 3, warpSpeed: 3 },
      4: { agility: 3, warpSpeed: 3.6 },
      5: { agility: 4, warpSpeed: 2.5 },
    };
    // 4 gains align 25% + warp 20%; 3 gains align 25%; 2 gains warp 20%.
    expect(await run('warp', figures)).toEqual([4, 3, 2]);
  });
});
