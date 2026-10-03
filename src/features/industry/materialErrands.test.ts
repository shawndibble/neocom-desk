import { describe, expect, it } from 'vitest';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { errandSubtotal, groupMaterialsByErrand, materialErrand } from './materialErrands';
import type { MaterialTableRow } from './subBuildPlan';

function row(overrides: Partial<MaterialTableRow> & { typeID: number }): MaterialTableRow {
  const quantity = overrides.quantity ?? 100;
  const ownedQuantity = overrides.ownedQuantity ?? 0;
  const remainingQuantity = overrides.remainingQuantity ?? quantity - ownedQuantity;
  const unitPrice = overrides.unitPrice === undefined ? 10 : overrides.unitPrice;
  return {
    quantity,
    ownedQuantity,
    remainingQuantity,
    unitPrice,
    lineCost: unitPrice === null ? 0 : remainingQuantity * unitPrice,
    unpriced: unitPrice === null && remainingQuantity > 0,
    subBuilds: [],
    ...overrides,
  } as MaterialTableRow;
}

const built = { subBuilds: [{}] } as unknown as Partial<MaterialTableRow>;

describe('materialErrand', () => {
  it('files a material with a remainder to buy under To buy', () => {
    expect(materialErrand(row({ typeID: 34 }))).toBe('toBuy');
  });

  it('files a partly owned material under To buy — there is still some left to get', () => {
    expect(materialErrand(row({ typeID: 34, quantity: 100, ownedQuantity: 40 }))).toBe('toBuy');
  });

  it('keeps an unpriced remainder under To buy rather than hiding it', () => {
    expect(materialErrand(row({ typeID: 34, unitPrice: null }))).toBe('toBuy');
  });

  it('files a fully owned material under Already have', () => {
    expect(materialErrand(row({ typeID: 34, quantity: 100, ownedQuantity: 100 }))).toBe('have');
  });

  it('files a material being built here under Building, owned or not', () => {
    expect(materialErrand(row({ typeID: 34, ...built }))).toBe('building');
    expect(materialErrand(row({ typeID: 34, ownedQuantity: 100, ...built }))).toBe('building');
  });

  it('files a Blueprint Acquisition row under Blueprint ahead of every other rule', () => {
    const tier = { me: 10, te: 20 };
    expect(materialErrand(row({ typeID: 999, acquisitionTier: tier }))).toBe('blueprint');
    // Owned outright: still the blueprint, not just another thing you have.
    expect(
      materialErrand(row({ typeID: 999, acquisitionTier: tier, quantity: 1, ownedQuantity: 1 }))
    ).toBe('blueprint');
  });

  it('files a zero-quantity line under Already have — nothing is left to get', () => {
    expect(materialErrand(row({ typeID: 34, quantity: 0 }))).toBe('have');
  });
});

describe('groupMaterialsByErrand', () => {
  it('splits rows into the four sections, keeping their order within each', () => {
    const rows = [
      row({ typeID: 1 }),
      row({ typeID: 2, ...built }),
      row({ typeID: 3, quantity: 5, ownedQuantity: 5 }),
      row({ typeID: 4 }),
      row({ typeID: 5, acquisitionTier: { me: 0, te: 0 } }),
    ];
    const groups = groupMaterialsByErrand(rows);
    expect(groups.toBuy.map((r) => r.typeID)).toEqual([1, 4]);
    expect(groups.building.map((r) => r.typeID)).toEqual([2]);
    expect(groups.blueprint.map((r) => r.typeID)).toEqual([5]);
    expect(groups.have.map((r) => r.typeID)).toEqual([3]);
  });

  it('can hold a row back in the section it was in — so an edit never moves it mid-row', () => {
    const rows = [row({ typeID: 1, quantity: 5, ownedQuantity: 5 }), row({ typeID: 2 })];
    const groups = groupMaterialsByErrand(rows, new Map([[1, 'toBuy']]));
    expect(groups.toBuy.map((r) => r.typeID)).toEqual([1, 2]);
    expect(groups.have).toEqual([]);
  });
});

describe('errandSubtotal', () => {
  const noSourcing: MaterialSourcingMap = {};

  it('sums the line totals still to be paid', () => {
    const rows = [
      row({ typeID: 1, quantity: 10, unitPrice: 5 }),
      row({ typeID: 2, quantity: 3, unitPrice: 2 }),
    ];
    expect(errandSubtotal(rows, noSourcing, true)).toEqual({ total: 56, unpricedCount: 0 });
  });

  it('leaves an unpriced row out of the total and counts it instead', () => {
    const rows = [
      row({ typeID: 1, quantity: 10, unitPrice: 5 }),
      row({ typeID: 2, unitPrice: null }),
    ];
    expect(errandSubtotal(rows, noSourcing, true)).toEqual({ total: 50, unpricedCount: 1 });
  });

  it('counts every hub-priced row as unpriced before prices have loaded', () => {
    const rows = [row({ typeID: 1, quantity: 10, unitPrice: 5 })];
    expect(errandSubtotal(rows, noSourcing, false)).toEqual({ total: 0, unpricedCount: 1 });
  });

  it('keeps a typed price in the total even before prices have loaded', () => {
    const rows = [row({ typeID: 1, quantity: 10, unitPrice: 5 })];
    expect(errandSubtotal(rows, { 1: { overridePrice: 5 } }, false)).toEqual({
      total: 50,
      unpricedCount: 0,
    });
  });
});
