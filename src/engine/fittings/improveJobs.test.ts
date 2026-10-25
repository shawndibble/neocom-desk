import { describe, expect, it } from 'vitest';
import {
  findImprovements,
  improveCandidates,
  type CandidateOptions,
  type ImproveCandidate,
} from './improve';
import { jobOf } from './improveGroups';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingSlotKind, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const index = buildVariationIndex({}, {});

describe('utility jobs', () => {
  it.each([
    [538, 'data and relic analyzers'],
    [481, 'scan probe launchers'],
    [1223, 'rangefinding and pinpointing arrays'],
    [1238, 'acquisition arrays'],
    [49, 'survey scanners'],
    [1122, 'salvagers'],
    [650, 'tractor beams'],
    [658, 'cynosural field generators'],
    [589, 'interdiction sphere launchers'],
    [72, 'smart bombs'],
  ])('group %i (%s) is a protected job', (group) => {
    expect(jobOf(group)).not.toBeNull();
  });

  it('gives each kind its own job, so one goal never drops another’s last module', () => {
    const groups = [538, 481, 1223, 1238, 49, 1122, 650, 658, 589, 72];
    expect(new Set(groups.map(jobOf)).size).toBe(groups.length);
  });
});

describe('Rework on an explorer under Best overall', () => {
  // 538 analyzer, 481 probe launcher, 1223 scan array, 330 cloak, 212 sensor booster, 211 tracking enhancer.
  const GROUP: Record<number, number> = {
    1: 538,
    2: 538,
    3: 481,
    4: 481,
    5: 1223,
    6: 1223,
    7: 330,
    8: 212,
    9: 212,
    10: 211,
  };
  const RACK: Record<number, FittingSlotKind> = {
    1: 'high',
    2: 'high',
    3: 'high',
    4: 'high',
    5: 'medium',
    6: 'medium',
    7: 'high',
    8: 'medium',
    9: 'medium',
    10: 'low',
  };
  const options: CandidateOptions = {
    goal: 'overall',
    reach: 'rework',
    defense: 'keep',
    includeRigs: false,
    includeOfficer: false,
    pool: {
      groupOf: (id) => GROUP[id],
      typeIdsInGroup: (g) =>
        Object.keys(GROUP)
          .map(Number)
          .filter((id) => GROUP[id] === g),
      published: () => true,
    },
  };

  it('offers no swap that drops its last analyzer, launcher, scan array or cloak', () => {
    const modules = [
      { slot: 'high', slotIndex: 0, typeId: 1 },
      { slot: 'high', slotIndex: 1, typeId: 3 },
      { slot: 'high', slotIndex: 2, typeId: 7 },
      { slot: 'medium', slotIndex: 0, typeId: 5 },
    ] as Fitting['modules'];
    const list = improveCandidates(modules, index, RACK, options);
    const dropped = list.filter(
      (c) => c.fromTypeId !== null && GROUP[c.fromTypeId] !== GROUP[c.toTypeId]
    );
    expect(dropped).toEqual([]);
  });
});

describe('a weaker module in an unscored job', () => {
  const stats = (perSecond: number, ehp: number): FittingStats => {
    const base = baseFittingStats();
    return {
      ...base,
      ehp,
      mining: {
        rows: [],
        perSecond,
        perHour: perSecond * 3600,
        wastePerSecond: 0,
        wastePct: 0,
      },
    } as FittingStats;
  };
  const figures: Record<number, [number, number]> = { 1: [10, 1000], 2: [8, 2000], 3: [12, 1100] };
  const of = async (f: Fitting) => stats(...figures[f.modules[0]!.typeId]!);
  const fitting = {
    shipTypeId: 1,
    name: 'Hulk',
    modules: [{ slot: 'high', slotIndex: 0, typeId: 1 }],
  } as unknown as Fitting;
  const swap = (toTypeId: number): ImproveCandidate => ({
    fromTypeId: 1,
    toTypeId,
    at: [{ slot: 'high', slotIndex: 0 }],
  });

  it('is a trade-off naming Mining yield, not No downside, under Best overall', async () => {
    const result = await findImprovements({
      fitting,
      before: await of(fitting),
      goal: 'overall',
      candidates: [swap(2), swap(3)],
      stats: of,
      priceOf: () => null,
    });
    expect(result!.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3]);
    expect(result!.tradeOffs.map((o) => o.candidate.toTypeId)).toEqual([2]);
    expect(result!.tradeOffs[0]!.downsides).toContain('miningYield');
  });

  it('Mine more is unchanged: it keeps only swaps that raise the yield', async () => {
    const result = await findImprovements({
      fitting,
      before: await of(fitting),
      goal: 'mining',
      candidates: [swap(2), swap(3)],
      stats: of,
      priceOf: () => null,
    });
    expect(result!.noDownside.map((o) => o.candidate.toTypeId)).toEqual([3]);
    expect(result!.tradeOffs).toEqual([]);
  });
});
