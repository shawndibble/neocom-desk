import { describe, it, expect } from 'vitest';
import { flattenMarketWideTree } from './flattenMarketWideTree.mjs';

function blueprints() {
  return {
    100: {
      time: 1000,
      materials: [
        { typeID: 201, quantity: 2 },
        { typeID: 999, quantity: 3 },
      ],
      products: [{ typeID: 1, quantity: 1 }],
    },
    200: {
      time: 100,
      materials: [{ typeID: 999, quantity: 5 }],
      products: [{ typeID: 201, quantity: 1 }],
    },
  };
}

function manufacturingByProduct() {
  return new Map([
    [1, 100],
    [201, 200],
  ]);
}

describe('flattenMarketWideTree', () => {
  it('is the top job time alone for a tree with no sub-builds', () => {
    const bps = {
      100: {
        time: 1000,
        materials: [{ typeID: 999, quantity: 3 }],
        products: [{ typeID: 1, quantity: 1 }],
      },
    };
    const result = flattenMarketWideTree(100, bps, new Map());
    expect(result.time).toBe(1000);
    expect([...result.materials]).toEqual([[999, 3]]);
  });

  it('adds the scaled sub-job time on top of the top job time for a two-level tree', () => {
    const result = flattenMarketWideTree(100, blueprints(), manufacturingByProduct());
    expect(result.time).toBe(1200);
  });

  it('flattens the sub-build materials down to base materials, scaled by the runs needed', () => {
    const result = flattenMarketWideTree(100, blueprints(), manufacturingByProduct());
    expect(result.materials.get(999)).toBe(13);
    expect(result.materials.has(201)).toBe(false);
  });

  it('scales sub-job time fractionally, the same way material quantities scale', () => {
    const bps = {
      100: {
        time: 1000,
        materials: [{ typeID: 201, quantity: 3 }],
        products: [{ typeID: 1, quantity: 1 }],
      },
      200: {
        time: 100,
        materials: [{ typeID: 999, quantity: 1 }],
        products: [{ typeID: 201, quantity: 2 }],
      },
    };
    const result = flattenMarketWideTree(
      100,
      bps,
      new Map([
        [1, 100],
        [201, 200],
      ])
    );
    expect(result.time).toBe(1000 + 1.5 * 100);
  });

  it('stops expanding at the depth cap, folding the rest in as a base material', () => {
    const bps = {};
    const byProduct = new Map();
    for (let i = 0; i <= 5; i++) {
      bps[i] = {
        time: 10,
        materials: [{ typeID: 1000 + i + 1, quantity: 1 }],
        products: [{ typeID: 1000 + i, quantity: 1 }],
      };
      byProduct.set(1000 + i, i);
    }
    const result = flattenMarketWideTree(0, bps, byProduct, 2);
    expect(result.time).toBe(10 + 10 + 10);
    expect(result.materials.get(1003)).toBe(1);
  });

  it('stops expanding a blueprint already on the current path, folding it in as a base material', () => {
    const bps = {
      100: {
        time: 50,
        materials: [{ typeID: 201, quantity: 1 }],
        products: [{ typeID: 101, quantity: 1 }],
      },
      200: {
        time: 20,
        materials: [{ typeID: 101, quantity: 1 }],
        products: [{ typeID: 201, quantity: 1 }],
      },
    };
    const byProduct = new Map([
      [101, 100],
      [201, 200],
    ]);
    const result = flattenMarketWideTree(100, bps, byProduct);
    expect(result.time).toBe(50 + 20);
    expect(result.materials.get(101)).toBe(1);
  });

  it('throws if the total comes out below the top job’s own time — the accumulator must never regress', () => {
    const bps = {
      100: {
        time: 1000,
        materials: [{ typeID: 201, quantity: 1 }],
        products: [{ typeID: 1, quantity: 1 }],
      },
      200: {
        time: -50,
        materials: [],
        products: [{ typeID: 201, quantity: 1 }],
      },
    };
    expect(() =>
      flattenMarketWideTree(
        100,
        bps,
        new Map([
          [1, 100],
          [201, 200],
        ])
      )
    ).toThrow(/regressed|below|less than/i);
  });

  it('throws on a non-finite total too — a malformed sub-blueprint (a zero product quantity, dividing by zero) must not slip past a plain "<" comparison', () => {
    const bps = {
      100: {
        time: 1000,
        materials: [{ typeID: 201, quantity: 1 }],
        products: [{ typeID: 1, quantity: 1 }],
      },
      200: {
        time: 50,
        materials: [],
        products: [{ typeID: 201, quantity: 0 }],
      },
    };
    expect(() =>
      flattenMarketWideTree(
        100,
        bps,
        new Map([
          [1, 100],
          [201, 200],
        ])
      )
    ).toThrow(/regressed|below|less than/i);
  });
});
