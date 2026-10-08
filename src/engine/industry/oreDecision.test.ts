import { describe, expect, it } from 'vitest';
import {
  allocateOreToNeeds,
  planCoverage,
  resolveRefiningRate,
  valueOreExits,
  type OreStack,
} from './oreDecision';

const TRIT = 34;
const PYER = 35;
const veldspar: OreStack = {
  typeId: 1230,
  units: 10_000,
  portionSize: 100,
  materials: [{ typeId: TRIT, quantity: 400 }],
  efficiency: 0.5,
  rawUnitPrice: 10,
};
const scordite: OreStack = {
  typeId: 1228,
  units: 10_000,
  portionSize: 100,
  materials: [
    { typeId: TRIT, quantity: 150 },
    { typeId: PYER, quantity: 90 },
  ],
  efficiency: 0.5,
  rawUnitPrice: 5,
};

describe('allocateOreToNeeds', () => {
  it('uses the ore least valuable raw per mineral first and caps at the need', () => {
    // Veldspar: 1000 ISK per batch / 200 trit = 5 ISK a mineral; Scordite: 500 / 75 = 6.7.
    // So Veldspar goes first.
    const r = allocateOreToNeeds({ [TRIT]: 600 }, [veldspar, scordite]);
    const s = r.ores.find((o) => o.typeId === 1228)!;
    const v = r.ores.find((o) => o.typeId === 1230)!;
    expect(v.batchesUsed).toBe(3); // 3 * 200 = 600 trit
    expect(s.batchesUsed).toBe(0);
    expect(v.unitsNotUsed).toBe(10_000 - 300);
    expect(r.covered[TRIT]).toBe(600);
  });

  it('takes a multi-mineral ore once and credits every mineral', () => {
    const r = allocateOreToNeeds({ [TRIT]: 300, [PYER]: 90 }, [scordite]);
    const s = r.ores[0];
    expect(s.credited[TRIT]).toBe(300);
    expect(s.credited[PYER]).toBe(90);
    expect(s.batchesUsed).toBe(4);
  });

  it('spills to the next ore when the first cannot cover the need', () => {
    const small = { ...veldspar, units: 200 };
    const r = allocateOreToNeeds({ [TRIT]: 600 }, [small, scordite]);
    expect(r.ores[0].batchesUsed).toBe(2);
    expect(r.covered[TRIT]).toBe(600);
  });

  it('reports the portion remainder as not used', () => {
    const odd = { ...veldspar, units: 4_350 };
    const r = allocateOreToNeeds({ [TRIT]: 1_000_000 }, [odd]);
    expect(r.ores[0].batchesUsed).toBe(43);
    expect(r.ores[0].unitsNotUsed).toBe(50);
  });

  it('ignores ore that refines into nothing the plan needs', () => {
    const r = allocateOreToNeeds({ [999]: 10 }, [veldspar]);
    expect(r.ores[0].batchesUsed).toBe(0);
    expect(r.covered).toEqual({});
  });
});

describe('planCoverage', () => {
  it('gives covered and percent per needed mineral, capped at the need', () => {
    expect(planCoverage({ [TRIT]: 400, [PYER]: 100 }, { [TRIT]: 300 })).toEqual([
      { typeId: TRIT, need: 400, covered: 300, percent: 75 },
      { typeId: PYER, need: 100, covered: 0, percent: 0 },
    ]);
  });
});

describe('resolveRefiningRate', () => {
  it('is the NPC base rate unless a structure rate is typed', () => {
    expect(resolveRefiningRate({ facility: 'npc' })).toBe(0.5);
    expect(resolveRefiningRate({ facility: 'structure', typedRate: 0.54 })).toBe(0.54);
    expect(resolveRefiningRate({ facility: 'structure' })).toBe(0.5);
    expect(resolveRefiningRate({ facility: 'npc', typedRate: 0.54 })).toBe(0.5);
  });
});

describe('valueOreExits', () => {
  it('values both exits net of the same sales tax and keeps the portion remainder', () => {
    const r = valueOreExits({
      stack: { ...veldspar, units: 4_350 },
      mineralPrices: { [TRIT]: 5 },
      salesTaxPct: 10,
    });
    expect(r.sellRaw).toBeCloseTo(4_350 * 10 * 0.9);
    expect(r.refineThenSell).toBeCloseTo(43 * 200 * 5 * 0.9);
    expect(r.unitsLeftOver).toBe(50);
    expect(r.pricedAll).toBe(true);
  });

  it('flags a missing mineral price as partial rather than free', () => {
    const r = valueOreExits({ stack: veldspar, mineralPrices: {}, salesTaxPct: 0 });
    expect(r.refineThenSell).toBe(0);
    expect(r.pricedAll).toBe(false);
  });
});
