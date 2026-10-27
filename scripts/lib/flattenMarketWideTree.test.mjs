import { describe, it, expect } from 'vitest';
import { flattenMarketWideTree } from './flattenMarketWideTree.mjs';

/**
 * A minimal blueprints map, shaped the same way `build-sde.mjs`'s own
 * `blueprints` object is: keyed by blueprint typeID (as this file's caller
 * always builds it, string or number keys both work as object keys), each
 * entry carrying `time` (seconds, one run), `materials`
 * (`{ typeID, quantity }[]`) and `products` (`{ typeID, quantity }[]`).
 */
function blueprints() {
  return {
    // Top job: 1 run makes 1 Widget, needs 2 Gizmos (built) + 3 Tritanium (base).
    100: {
      time: 1000,
      materials: [
        { typeID: 201, quantity: 2 },
        { typeID: 999, quantity: 3 },
      ],
      products: [{ typeID: 1, quantity: 1 }],
    },
    // Sub job: 1 run of the Gizmo blueprint makes 1 Gizmo, needs 5 Tritanium.
    200: {
      time: 100,
      materials: [{ typeID: 999, quantity: 5 }],
      products: [{ typeID: 201, quantity: 1 }],
    },
  };
}

function manufacturingByProduct() {
  // productTypeID -> blueprintTypeID
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
    // Building the top job needs 2 runs of the Gizmo blueprint (2 Gizmos
    // needed, 1 per run) — 2 x 100s = 200s on top of the top job's own 1000s.
    const result = flattenMarketWideTree(100, blueprints(), manufacturingByProduct());
    expect(result.time).toBe(1200);
  });

  it('flattens the sub-build materials down to base materials, scaled by the runs needed', () => {
    const result = flattenMarketWideTree(100, blueprints(), manufacturingByProduct());
    // 3 Tritanium direct + 2 runs x 5 Tritanium from the Gizmo sub-build = 13.
    expect(result.materials.get(999)).toBe(13);
    // The Gizmo itself never appears — it was fully resolved into Tritanium.
    expect(result.materials.has(201)).toBe(false);
  });

  it('scales sub-job time fractionally, the same way material quantities scale', () => {
    // Needing 1 Gizmo (not 2) from a blueprint whose own run makes 1 Gizmo
    // means exactly 1 run — no fractional case needed here, so use a
    // blueprint whose one run makes 2 Gizmos: needing 3 Gizmos costs 1.5 runs.
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
    // A single-link chain deep enough to hit a low cap: blueprint N makes
    // product N via blueprint N, each needing 1 unit of product N+1.
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
    // Depth 0 (bp 0) expands into bp 1 (depth 1), which expands into bp 2
    // (depth 2 == cap, stops there) — so bp 2's own material (product 1003)
    // is folded in as a base material rather than expanded further.
    expect(result.time).toBe(10 + 10 + 10);
    expect(result.materials.get(1003)).toBe(1);
  });

  it('stops expanding a blueprint already on the current path, folding it in as a base material', () => {
    // Blueprint 100 needs product 201 (made by blueprint 200), which in turn
    // needs product 101 (made by blueprint 100 again) — a cycle.
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
    // 100 -> expands 200 (not yet visited) -> 200 needs 101, made by 100,
    // already on the visited path, so folds in as a base material instead
    // of recursing infinitely.
    expect(result.time).toBe(50 + 20);
    expect(result.materials.get(101)).toBe(1);
  });

  it('throws if the total comes out below the top job’s own time — the accumulator must never regress', () => {
    // Can't happen through the real recursion (every addition is
    // non-negative), so this exercises the guard directly against a
    // deliberately corrupt sub-job time.
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
    // A zero product quantity divides the sub-multiplier by zero, producing
    // Infinity — and both `Infinity < bp.time` and `NaN < bp.time` are
    // false, so a naive `time < bp.time` guard would silently let either
    // through instead of catching it.
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
