import { describe, expect, it } from 'vitest';
import { flattenBuildResult } from './resultFlattenCache';
import type { BuildResult, MaterialCostLine } from '@/engine/industry/types';

function line(
  typeID: number,
  quantity: number,
  extra: Partial<MaterialCostLine> = {}
): MaterialCostLine {
  const ownedQuantity = extra.ownedQuantity ?? 0;
  return {
    typeID,
    baseQuantity: quantity,
    quantity,
    ownedQuantity,
    remainingQuantity: extra.remainingQuantity ?? quantity - ownedQuantity,
    unitPrice: 'unitPrice' in extra ? (extra.unitPrice ?? null) : 10,
    lineCost: extra.lineCost ?? (quantity - ownedQuantity) * 10,
    unpriced: extra.unpriced ?? false,
  };
}

function result(materials: MaterialCostLine[]): BuildResult {
  return {
    materials,
    seconds: 100,
    jobFee: { eiv: 0, grossCost: 0, facilityTax: 0, sccSurcharge: 0, total: 5 },
    materialCost: 100,
    totalCost: 105,
    buyCost: 200,
    revenue: null,
    salesTax: null,
    brokerFee: null,
    netRevenue: null,
    profit: null,
    marginPct: null,
    iskPerHour: null,
    grossProfit: null,
    grossMargin: null,
    grossIskPerHour: null,
    breakEvenPrice: null,
    unpricedMaterials: [],
    unpriceable: false,
    recommendation: 'build',
  } as BuildResult;
}

describe('flattenBuildResult', () => {
  it('returns the same reference on a second call with the same result object', () => {
    const r = result([line(34, 100)]);

    const first = flattenBuildResult(r);
    const second = flattenBuildResult(r);

    expect(second).toBe(first);
    expect(second.shopping).toBe(first.shopping);
    expect(second.table).toBe(first.table);
  });

  it('flattens independently for a different result object, even with identical materials', () => {
    const materials = [line(34, 100)];

    const a = flattenBuildResult(result(materials));
    const b = flattenBuildResult(result(materials));

    expect(a).not.toBe(b);
    expect(a.shopping).toEqual(b.shopping);
  });

  it('flattens the shopping list and material table off the result materials', () => {
    const materials = [line(34, 100), line(35, 50)];

    const flattened = flattenBuildResult(result(materials));

    expect(flattened.shopping.map((m) => m.typeID)).toEqual([34, 35]);
    expect(flattened.table.map((m) => m.typeID)).toEqual([34, 35]);
  });
});
