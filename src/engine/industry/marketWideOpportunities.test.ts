import { describe, expect, it } from 'vitest';
import { computeMarketWideRows, selectLiquidCandidates } from './marketWideOpportunities';

describe('selectLiquidCandidates', () => {
  const candidates = [
    { productTypeID: 1, marketGroupID: 100, sellPrice: 10, sellVolume: 1_000_000 }, // depth 10M
    { productTypeID: 2, marketGroupID: 100, sellPrice: 10, sellVolume: 5_000_000 }, // depth 50M
    { productTypeID: 3, marketGroupID: 100, sellPrice: 1, sellVolume: 100 }, // depth 100 - below floor
    { productTypeID: 4, marketGroupID: 200, sellPrice: 100, sellVolume: 1_000_000 }, // depth 100M
    { productTypeID: 5, marketGroupID: null, sellPrice: null, sellVolume: null }, // unpriceable
  ];

  it('drops candidates below the liquidity floor', () => {
    const result = selectLiquidCandidates(candidates, 1_000_000, 10);
    expect(result.map((c) => c.productTypeID)).not.toContain(3);
    expect(result.map((c) => c.productTypeID)).not.toContain(5);
  });

  it('caps each Market Group category to the top N by sell depth', () => {
    const result = selectLiquidCandidates(candidates, 1_000_000, 1);
    // group 100 has two candidates clearing the floor (1, 2); only the
    // deepest (2) should survive a top-1 cap. Group 200's lone candidate (4)
    // survives regardless.
    expect(result.map((c) => c.productTypeID).sort()).toEqual([2, 4]);
  });

  it('treats a null Market Group as its own single bucket, never merged with another null', () => {
    const withTwoUngrouped = [
      { productTypeID: 10, marketGroupID: null, sellPrice: 10, sellVolume: 1_000_000 },
      { productTypeID: 11, marketGroupID: null, sellPrice: 20, sellVolume: 1_000_000 },
    ];
    // Top-1 per group would drop one of these if both null-group candidates
    // shared a bucket; each survives because a null group never merges.
    const result = selectLiquidCandidates(withTwoUngrouped, 1_000_000, 1);
    expect(result.map((c) => c.productTypeID).sort()).toEqual([10, 11]);
  });

  it('returns an empty list when nothing clears the floor', () => {
    expect(selectLiquidCandidates(candidates, 1_000_000_000, 10)).toEqual([]);
  });
});

describe('computeMarketWideRows', () => {
  const tree = {
    blueprintTypeID: 900,
    time: 3600, // 1 hour
    outputQuantity: 1,
    marketGroupID: 100,
    materials: [
      { typeID: 50, quantity: 10 },
      { typeID: 51, quantity: 5 },
    ],
  };

  it('computes ISK/hour from flattened materials, sell price, and time', () => {
    const rows = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([
        [50, 10], // 10 * 10 = 100
        [51, 20], // 5 * 20 = 100
      ])
    );
    // buildCost = 200, revenue = 1000 * 1 = 1000, profit = 800, / 1 hour = 800/hr
    expect(rows).toEqual([
      expect.objectContaining({ id: '1', iskPerHour: 800, buildCost: 200, orderDepth: 'deep' }),
    ]);
  });

  it('excludes a row when any flattened material has no known price', () => {
    const rows = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([[50, 10]]) // typeID 51 missing
    );
    expect(rows).toEqual([]);
  });

  it('ranks multiple rows by ISK/hour descending', () => {
    const cheapTree = { ...tree, materials: [{ typeID: 50, quantity: 1 }] };
    const rows = computeMarketWideRows(
      [
        { productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 },
        { productTypeID: 2, tree: cheapTree, sellPrice: 1000, sellDepthIsk: 5_000_000 },
      ],
      new Map([
        [50, 10],
        [51, 20],
      ])
    );
    expect(rows.map((r) => r.id)).toEqual(['2', '1']);
  });
});
