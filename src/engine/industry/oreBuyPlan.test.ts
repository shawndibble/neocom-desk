import { describe, expect, it } from 'vitest';
import { reprocessingYield } from './reprocessing';
import {
  compareOreRoute,
  mineralShortfall,
  oreBuyListText,
  planOreBuy,
  type BuyableOre,
} from './oreBuyPlan';

const TRIT = 34;
const PYER = 35;
const MEX = 36;

const heavyCheap: BuyableOre = {
  typeId: 1,
  portionSize: 100,
  materials: [{ typeId: TRIT, quantity: 400 }],
  efficiency: 0.5,
  unitPrice: 5,
  unitVolume: 0.1,
};
const lightPricey: BuyableOre = {
  typeId: 2,
  portionSize: 100,
  materials: [{ typeId: TRIT, quantity: 400 }],
  efficiency: 0.5,
  unitPrice: 8,
  unitVolume: 0.05,
};
const multi: BuyableOre = {
  typeId: 3,
  portionSize: 100,
  materials: [
    { typeId: TRIT, quantity: 150 },
    { typeId: PYER, quantity: 90 },
  ],
  efficiency: 0.5,
  unitPrice: 6,
  unitVolume: 0.1,
};

const refinedOf = (ore: BuyableOre, units: number) => reprocessingYield({ ...ore, units }).outputs;

describe('planOreBuy', () => {
  it('covers every shortfall mineral with whole-portion output, ores yielding several minerals', () => {
    const needs = { [TRIT]: 600, [PYER]: 450 };
    for (const ordering of ['cost', 'volume'] as const) {
      const route = planOreBuy({ needs, ores: [heavyCheap, lightPricey, multi], ordering });
      expect(route.uncovered).toEqual([]);
      const got: Record<number, number> = {};
      for (const p of route.purchases) {
        expect(p.units % 100).toBe(0);
        const ore = [heavyCheap, lightPricey, multi].find((o) => o.typeId === p.typeId)!;
        for (const o of refinedOf(ore, p.units)) got[o.typeId] = (got[o.typeId] ?? 0) + o.quantity;
      }
      expect(got[TRIT]).toBeGreaterThanOrEqual(600);
      expect(got[PYER]).toBeGreaterThanOrEqual(450);
      expect(route.refined).toEqual(got);
    }
  });

  it('shows leftover minerals beyond the shortfall', () => {
    const route = planOreBuy({
      needs: { [TRIT]: 600, [PYER]: 450 },
      ores: [multi],
      ordering: 'cost',
    });
    // 10 batches: 750 trit, 450 pyer.
    expect(route.purchases).toEqual([expect.objectContaining({ typeId: 3, batches: 10 })]);
    expect(route.leftovers).toEqual({ [TRIT]: 150 });
  });

  it('cheapest and lightest differ, each best for its own metric', () => {
    const needs = { [TRIT]: 1000 };
    const cheap = planOreBuy({ needs, ores: [heavyCheap, lightPricey], ordering: 'cost' });
    const light = planOreBuy({ needs, ores: [heavyCheap, lightPricey], ordering: 'volume' });
    expect(cheap.purchases.map((p) => p.typeId)).toEqual([1]);
    expect(light.purchases.map((p) => p.typeId)).toEqual([2]);
    expect(cheap.cost).toBe(2500);
    expect(light.cost).toBe(4000);
    expect(cheap.volume).toBe(50);
    expect(light.volume).toBe(25);
    expect(cheap.cost).toBeLessThan(light.cost);
    expect(light.volume).toBeLessThan(cheap.volume);
  });

  it('repair pass drops a batch the later picks made redundant', () => {
    // Multi is bought first for Pyerite; Veldspar then covers all trit, so
    // Multi's extra batches that only served trit are trimmed.
    const route = planOreBuy({
      needs: { [TRIT]: 1000, [PYER]: 90 },
      ores: [heavyCheap, multi],
      ordering: 'cost',
    });
    expect(route.uncovered).toEqual([]);
    const total = route.refined[TRIT]!;
    expect(total).toBeGreaterThanOrEqual(1000);
    // Removing any one batch of any purchase breaks coverage.
    for (const p of route.purchases) {
      const ore = [heavyCheap, multi].find((o) => o.typeId === p.typeId)!;
      const lost = refinedOf(ore, p.units).reduce<Record<number, number>>(
        (m, o) => ({ ...m, [o.typeId]: o.quantity }),
        {}
      );
      const less = refinedOf(ore, p.units - 100).reduce<Record<number, number>>(
        (m, o) => ({ ...m, [o.typeId]: o.quantity }),
        {}
      );
      const broken = [TRIT, PYER].some(
        (id) =>
          (route.refined[id] ?? 0) - ((lost[id] ?? 0) - (less[id] ?? 0)) < (id === TRIT ? 1000 : 90)
      );
      expect(broken).toBe(true);
    }
  });

  it('reports minerals no candidate ore yields and plans the rest', () => {
    const route = planOreBuy({
      needs: { [TRIT]: 200, [MEX]: 10 },
      ores: [heavyCheap],
      ordering: 'cost',
    });
    expect(route.uncovered).toEqual([MEX]);
    expect(route.refined[TRIT]).toBeGreaterThanOrEqual(200);
  });

  it('plans nothing for no shortfall', () => {
    const route = planOreBuy({ needs: { [TRIT]: 0 }, ores: [heavyCheap], ordering: 'cost' });
    expect(route.purchases).toEqual([]);
    expect(route.cost).toBe(0);
  });

  it('skips an unpriced ore', () => {
    const route = planOreBuy({
      needs: { [TRIT]: 200 },
      ores: [{ ...heavyCheap, unitPrice: null }, lightPricey],
      ordering: 'cost',
    });
    expect(route.purchases.map((p) => p.typeId)).toEqual([2]);
  });
});

describe('volume ordering', () => {
  it('skips an ore with no known volume instead of treating it as free to haul', () => {
    const route = planOreBuy({
      needs: { [TRIT]: 200 },
      ores: [{ ...heavyCheap, unitVolume: 0 }, lightPricey],
      ordering: 'volume',
    });
    expect(route.purchases.map((p) => p.typeId)).toEqual([2]);
  });
});

describe('compareOreRoute', () => {
  const route = planOreBuy({
    needs: { [TRIT]: 600, [PYER]: 450 },
    ores: [multi],
    ordering: 'cost',
  });

  it('values leftovers at the buy price and recommends ore when it beats minerals', () => {
    const c = compareOreRoute({
      route,
      mineralsTotal: 10_000,
      mineralBuyPrices: { [TRIT]: 4 },
    });
    // ore 10 batches * 600 = 6000; leftover 150 * 4 = 600.
    expect(c.oreCost).toBe(6000);
    expect(c.leftoverValue).toBe(600);
    expect(c.oreNet).toBe(5400);
    expect(c.saving).toBe(4600);
    expect(c.recommendOre).toBe(true);
  });

  it('says buy minerals when the ore route costs more', () => {
    const c = compareOreRoute({
      route,
      mineralsTotal: 5_000,
      mineralBuyPrices: { [TRIT]: 4 },
    });
    expect(c.saving).toBe(-400);
    expect(c.recommendOre).toBe(false);
  });

  it('flags an unpriced leftover rather than counting it free', () => {
    const c = compareOreRoute({
      route,
      mineralsTotal: 10_000,
      mineralBuyPrices: {},
    });
    expect(c.leftoverValue).toBe(0);
    expect(c.leftoverUnpriced).toEqual([TRIT]);
  });

  it('never recommends ore when a mineral is uncovered', () => {
    const partial = planOreBuy({
      needs: { [TRIT]: 200, [MEX]: 10 },
      ores: [heavyCheap],
      ordering: 'cost',
    });
    const c = compareOreRoute({
      route: partial,
      mineralsTotal: 1e9,
      mineralBuyPrices: {},
    });
    expect(c.recommendOre).toBe(false);
  });
});

describe('oreBuyListText', () => {
  it('writes name, tab, units per line', () => {
    expect(
      oreBuyListText(
        [
          { typeId: 1, units: 500 },
          { typeId: 3, units: 1000 },
        ],
        (id) => `Ore ${id}`
      )
    ).toBe('Ore 1\t500\nOre 3\t1000');
  });
});

describe('mineralShortfall', () => {
  it('keeps bought mineral rows with units left, summed with their cost', () => {
    const r = mineralShortfall([
      { typeID: TRIT, remainingQuantity: 100, lineCost: 500 },
      { typeID: PYER, remainingQuantity: 0, lineCost: 0 },
      { typeID: MEX, remainingQuantity: 5, lineCost: 50, subBuilds: [{}] },
      { typeID: 999, remainingQuantity: 5, lineCost: 50 },
    ]);
    expect(r).toEqual({ needs: { [TRIT]: 100 }, total: 500 });
  });

  it('has no total when a mineral is unpriced', () => {
    expect(
      mineralShortfall([{ typeID: TRIT, remainingQuantity: 1, lineCost: null }]).total
    ).toBeNull();
  });

  it('is empty without a shortfall', () => {
    expect(mineralShortfall([{ typeID: 999, remainingQuantity: 5, lineCost: 1 }]).needs).toEqual(
      {}
    );
  });
});
