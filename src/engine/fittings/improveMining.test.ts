import { describe, expect, it } from 'vitest';
import {
  findImprovements,
  goalAvailability,
  improveCandidates,
  type ImproveCandidate,
} from './improve';
import {
  bestCrystalKey,
  crystalKeyOf,
  crystalLabel,
  crystalsOfFamily,
  loadCrystals,
  minerWithoutCrystal,
  unloadedMiners,
} from './improveMining';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const MINER_ROW = { isDrone: false, count: 1, perCycle: 0, cycleSeconds: 60, wastePerSecond: 0 };

function minerStats(perSecond: number, modules = true): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    mining: {
      rows: modules ? [{ ...MINER_ROW, typeId: 1, perSecond }] : [],
      perSecond,
      perHour: perSecond * 3600,
      wastePerSecond: 0,
      wastePct: 0,
    },
  } as FittingStats;
}

const fit = (typeIds: number[]): Fitting =>
  ({
    shipTypeId: 1,
    name: 'Barge',
    modules: typeIds.map((typeId, slotIndex) => ({ slot: 'high', slotIndex, typeId })),
  }) as unknown as Fitting;

const swap = (fromTypeId: number, toTypeId: number): ImproveCandidate => ({
  fromTypeId,
  toTypeId,
  at: [{ slot: 'high', slotIndex: 0 }],
});

describe('Mine more goal', () => {
  it('is unavailable with a reason when the fit has no miner modules', () => {
    expect(goalAvailability('mining', minerStats(0, false))).toEqual({
      available: false,
      reason: 'noMiners',
    });
    const dronesOnly = minerStats(5);
    dronesOnly.mining.rows[0] = { ...dronesOnly.mining.rows[0]!, isDrone: true };
    expect(goalAvailability('mining', dronesOnly)).toEqual({
      available: false,
      reason: 'noMiners',
    });
    expect(goalAvailability('mining', minerStats(5))).toEqual({ available: true });
  });

  it('scores the m³/s gain of the whole fit and keeps only the swaps that raise it, best first', async () => {
    const yields: Record<number, number> = { 1: 10, 2: 12, 3: 15, 4: 8 };
    const stats = async (f: Fitting) => minerStats(yields[f.modules[0]!.typeId]!);
    const base = fit([1]);
    const result = await findImprovements({
      fitting: base,
      before: await stats(base),
      goal: 'mining',
      candidates: [swap(1, 2), swap(1, 3), swap(1, 4)],
      stats,
      priceOf: () => null,
    });
    expect(result!.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3, 2]);
    expect(result!.noDownside[0]!.score).toBeCloseTo(0.5);
  });
});

describe('crystals', () => {
  const names: Record<number, string> = {
    10: 'Simple Asteroid Mining Crystal Type A I',
    11: 'Simple Asteroid Mining Crystal Type A II',
    12: 'Simple Asteroid Mining Crystal Type B II',
    20: 'Rare Moon Mining Crystal Type A II',
    30: 'Nanite Repair Paste',
  };
  const nameOf = (typeId: number) => names[typeId];

  it('crystalsOfFamily keeps only the family’s crystals, by type id', () => {
    expect(crystalsOfFamily('Simple Asteroid', [10, 11, 12, 20, 30], nameOf)).toEqual([10, 11, 12]);
  });

  it('crystalKeyOf names a crystal by letter and tech level', () => {
    expect(crystalKeyOf(names[11]!)).toBe('A2');
    expect(crystalKeyOf(names[30]!)).toBeNull();
  });

  it('loadCrystals loads the crystal into every miner it names, leaving other modules alone', () => {
    const fitting = {
      ...fit([1, 1, 7]),
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 1, chargeTypeId: 99 },
        { slot: 'high', slotIndex: 1, typeId: 1 },
        { slot: 'high', slotIndex: 2, typeId: 7, chargeTypeId: 55 },
      ],
    } as unknown as Fitting;
    const loaded = loadCrystals(fitting, (typeId) => (typeId === 1 ? 11 : null));
    expect(loaded.modules.map((m) => m.chargeTypeId)).toEqual([11, 11, 55]);
    expect(fitting.modules[0]!.chargeTypeId).toBe(99);
  });
});

describe('bestCrystalKey', () => {
  it('picks the crystal that mines the most, and none when the miners take no crystal of the family', async () => {
    const yields: Record<string, number> = { A1: 10, A2: 14, B2: 12 };
    expect(await bestCrystalKey(['A1', 'A2', 'B2'], async (key) => yields[key]!)).toBe('A2');
    expect(await bestCrystalKey([], async () => 1)).toBeNull();
  });
});

describe('unloadedMiners', () => {
  const crystalsOf = (typeId: number) => (typeId === 1 ? [11, 12] : []);
  const crystalFor = (typeId: number) => (typeId === 1 ? 12 : null);
  const module = (slotIndex: number, typeId: number, extra: object = {}) => ({
    slot: 'high',
    slotIndex,
    typeId,
    state: 'active',
    ...extra,
  });

  it("counts active miners with no crystal, or another ore's, and steps to load the plan's crystal", () => {
    const fitting = {
      modules: [
        module(0, 1),
        module(1, 1, { chargeTypeId: 99 }),
        module(2, 1, { chargeTypeId: 11 }),
        module(3, 1, { state: 'online' }),
        module(4, 7),
      ],
    } as unknown as Fitting;
    expect(unloadedMiners(fitting, crystalsOf, crystalFor)).toEqual({
      count: 2,
      steps: [
        {
          chargeTypeId: 12,
          fromCargo: false,
          at: [
            { slot: 'high', slotIndex: 0 },
            { slot: 'high', slotIndex: 1 },
          ],
        },
      ],
    });
  });

  it('is null when every miner holds a crystal of the ore', () => {
    const fitting = { modules: [module(0, 1, { chargeTypeId: 12 })] } as unknown as Fitting;
    expect(unloadedMiners(fitting, crystalsOf, crystalFor)).toBeNull();
  });
});

describe('minerWithoutCrystal', () => {
  const plan = (typeId: number) => (typeId === 1 ? 12 : null);

  it('flags a crystal miner that does not hold the plan crystal', () => {
    expect(minerWithoutCrystal([{ typeId: 1, isDrone: false, chargeTypeId: 11 }], plan)).toBe(true);
  });

  it('lets a miner that takes no crystal pass, though its charge is undefined and the plan says null', () => {
    const rows = [
      { typeId: 1, isDrone: false, chargeTypeId: 12 },
      { typeId: 2, isDrone: false, chargeTypeId: undefined },
    ];
    expect(minerWithoutCrystal(rows, plan)).toBe(false);
  });

  it('ignores drones', () => {
    expect(minerWithoutCrystal([{ typeId: 3, isDrone: true, chargeTypeId: 5 }], plan)).toBe(false);
  });
});

describe('crystalLabel', () => {
  it('reads a crystal key as its type', () => {
    expect(crystalLabel('B2')).toBe('Type B II');
    expect(crystalLabel('A1')).toBe('Type A I');
  });
});

describe('improveCandidates for Mine more', () => {
  const index = buildVariationIndex({}, {});

  it('Rework offers other miners and mining upgrades, and never drops the last miner for something else', () => {
    const pool = {
      groupOf: (typeId: number) => ({ 1: 54, 2: 54, 3: 483, 5: 546, 9: 59 })[typeId],
      typeIdsInGroup: (group: number) => (group === 54 ? [1, 2] : group === 483 ? [3] : []),
      published: () => true,
    };
    const modules = [{ slot: 'high', slotIndex: 0, typeId: 1, state: 'active' }] as never;
    const found = improveCandidates(
      modules,
      index,
      { '1': 'high', '2': 'high', '3': 'high' },
      {
        goal: 'mining',
        reach: 'rework',
        pool,
      }
    );
    expect(found.map((c) => c.toTypeId).sort()).toEqual([2, 3]);
  });
});
