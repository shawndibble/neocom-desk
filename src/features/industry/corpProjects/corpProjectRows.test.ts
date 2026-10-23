import { describe, expect, it } from 'vitest';
import type { CorpManufactureProject } from '@/engine/corpProjects/corpProjects';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { BlueprintCatalogEntry } from '../blueprintCatalog';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from '../facilityDefaults';
import {
  buildCorpProjectRow,
  ownedBlueprintFor,
  planForCorpProject,
  runsForUnits,
} from './corpProjectRows';

const entry = (quantity = 1): BlueprintCatalogEntry => ({
  blueprintTypeID: 100,
  blueprint: {
    name: 'Hurricane Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 100 }],
    products: [{ typeID: 24702, quantity }],
    skills: [],
    activity: 'manufacturing',
  },
  productTypeID: 24702,
  productName: 'Hurricane',
  productNameLower: 'hurricane',
});

const bp = (over: Partial<CharacterBlueprint> = {}): CharacterBlueprint => ({
  item_id: 1,
  type_id: 100,
  quantity: 1,
  material_efficiency: 10,
  time_efficiency: 20,
  runs: -1,
  location_id: 60003760,
  location_flag: 'Hangar',
  ...over,
});

const project: CorpManufactureProject = {
  id: 'p1',
  name: 'Hurricane hulls',
  typeId: 24702,
  rewardEach: 41_800_000,
  poolInitial: 2_090_000_000,
  poolRemaining: 1_254_000_000,
  cap: 10,
  contributed: 3,
  expires: '2026-10-27T10:00:00Z',
};

describe('runsForUnits', () => {
  it('is one run per unit for a ship', () => {
    expect(runsForUnits(7, entry(1))).toBe(7);
  });
  it('rounds up to whole runs when a run makes several units', () => {
    expect(runsForUnits(250, entry(100))).toBe(3);
  });
  it('is at least one run', () => {
    expect(runsForUnits(0, entry(1))).toBe(1);
  });
});

describe('ownedBlueprintFor', () => {
  it('prefers an original, then the best material efficiency', () => {
    const copy = bp({ item_id: 1, runs: 20, material_efficiency: 10 });
    const lowOriginal = bp({ item_id: 2, runs: -1, material_efficiency: 2 });
    const highOriginal = bp({ item_id: 3, runs: -1, material_efficiency: 8 });
    expect(ownedBlueprintFor([copy, lowOriginal, highOriginal], 100)?.item_id).toBe(3);
    expect(
      ownedBlueprintFor([copy, bp({ item_id: 4, runs: 5, material_efficiency: 9 })], 100)?.item_id
    ).toBe(1);
  });
  it('is null when the Character holds none of that blueprint', () => {
    expect(ownedBlueprintFor([bp({ type_id: 999 })], 100)).toBeNull();
  });
});

describe('planForCorpProject', () => {
  const base = {
    entry: entry(),
    characterId: 7,
    hub: getTradeHub('amarr') ?? DEFAULT_TRADE_HUB,
    facilityDefaults: DEFAULT_ACTIVITY_FACILITY_DEFAULTS,
    assumedMe: 4,
    stock: new Map([[34, { quantity: 250 }]]) as never,
  };

  it('runs the remaining units, at the Character’s hub, with the owned blueprint’s research', () => {
    const plan = planForCorpProject({
      ...base,
      owned: bp({ material_efficiency: 9, time_efficiency: 18 }),
      units: 7,
    });
    expect(plan.runs).toBe(7);
    expect(plan.hubId).toBe(base.hub.id);
    expect(plan.characterId).toBe(7);
    expect(plan.blueprintTypeID).toBe(100);
    expect([plan.me, plan.te]).toEqual([9, 18]);
  });

  it('quotes an unowned blueprint at the assumed ME', () => {
    const plan = planForCorpProject({ ...base, owned: null, units: 3 });
    expect(plan.me).toBe(4);
  });

  it('claims owned materials for every run, up to the stock held', () => {
    const plan = planForCorpProject({ ...base, owned: null, units: 7 });
    // 7 runs x 100 = 700 needed, 250 held.
    expect(plan.materialSourcing?.[34]).toEqual({ ownedQuantity: 250 });
  });
});

describe('buildCorpProjectRow', () => {
  const result = (totalCost: number, acquisition?: object): BuildResult =>
    ({
      totalCost,
      materials: acquisition ? [{ typeID: 100, acquisitionTier: {}, ...acquisition }] : [],
    }) as unknown as BuildResult;
  const base = {
    project,
    characterId: 7,
    characterName: 'Kestrel Vane',
    entry: entry(),
    owned: null,
    now: new Date('2026-10-23T10:00:00Z'),
  };

  it('prices an owned blueprint as free: profit is the reward less the build cost', () => {
    const row = buildCorpProjectRow({
      ...base,
      owned: bp(),
      compared: { loading: false, result: result(7 * 36_400_000), error: null },
    });
    expect(row.remaining).toBe(7);
    expect(row.source).toEqual({
      kind: 'owned',
      detail: { original: true, me: 10, te: 20 },
    });
    expect(row.unitCost).toBe(36_400_000);
    expect(row.profit).toBe((41_800_000 - 36_400_000) * 7);
    expect(row.hoursLeft).toBe(96);
  });

  it('takes a bought copy’s price out of the unit cost and off the profit', () => {
    const row = buildCorpProjectRow({
      ...base,
      compared: {
        loading: false,
        result: result(7 * 36_400_000 + 4_200_000, { unitPrice: 4_200_000, quantity: 1 }),
        error: null,
      },
    });
    expect(row.source).toEqual({ kind: 'copy', price: 4_200_000 });
    expect(row.unitCost).toBe(36_400_000);
    expect(row.profit).toBe((41_800_000 - 36_400_000) * 7 - 4_200_000);
  });

  it('spreads a whole run’s cost over the units that earn the reward when a run makes more', () => {
    // 10 units left, 100 per run: one run builds 100, and all of it is paid for.
    const row = buildCorpProjectRow({
      ...base,
      project: { ...project, cap: 13, contributed: 3, rewardEach: 1_000_000 },
      entry: entry(100),
      compared: { loading: false, result: result(5_000_000), error: null },
    });
    expect(row.remaining).toBe(10);
    expect(row.unitCost).toBe(500_000);
    expect(row.profit).toBe(10 * 1_000_000 - 5_000_000);
  });

  it('has no figures while the plan is still pricing, or when it could not be priced', () => {
    const loading = buildCorpProjectRow({
      ...base,
      compared: { loading: true, result: null, error: null },
    });
    expect([loading.loading, loading.profit, loading.unitCost, loading.source]).toEqual([
      true,
      null,
      null,
      null,
    ]);
    const failed = buildCorpProjectRow({
      ...base,
      compared: { loading: false, result: null, error: 'no price' },
    });
    expect([failed.loading, failed.profit]).toEqual([false, null]);
  });
});
