import { describe, expect, it } from 'vitest';
import {
  rankMarketWideRows,
  selectLiquidCandidates,
  type PricedMarketWideCandidate,
} from './marketWideOpportunities';

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

describe('rankMarketWideRows', () => {
  const priced = (
    productTypeID: number,
    overrides: Partial<PricedMarketWideCandidate> = {}
  ): PricedMarketWideCandidate => ({
    productTypeID,
    profit: 625,
    marginPct: 62.5,
    seconds: 3600,
    iskPerHour: 625,
    buildCost: 375,
    outputQuantity: 1,
    sellDepthIsk: 5_000_000,
    me: 0,
    te: 0,
    ...overrides,
  });

  it('ranks rows by ISK/hour descending', () => {
    const rows = rankMarketWideRows([
      priced(1, { iskPerHour: 100 }),
      priced(2, { iskPerHour: 900 }),
      priced(3, { iskPerHour: 400 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it("carries the plan's margin, duration and cost through to the row (issue #2297)", () => {
    const [row] = rankMarketWideRows([priced(1)]);
    expect(row).toMatchObject({
      productTypeID: 1,
      marginPct: 62.5,
      seconds: 3600,
      iskPerHour: 625,
      buildCost: 375,
    });
  });

  it('carries the ME/TE a plan opened from the row starts at (issue #5232)', () => {
    const [row] = rankMarketWideRows([priced(1, { me: 8, te: 14 })]);
    expect(row).toMatchObject({ me: 8, te: 14 });
  });

  it('reports net profit per unit sold, for ISK/day', () => {
    const [row] = rankMarketWideRows([priced(1, { profit: 1000, outputQuantity: 4 })]);
    expect(row!.unitMargin).toBe(250);
    expect(row!.outputQuantity).toBe(4);
  });

  it('keeps a loss negative, and a zero-output product at a zero unit margin', () => {
    const [loss, none] = rankMarketWideRows([
      priced(1, { profit: -80, iskPerHour: -80, marginPct: -8 }),
      priced(2, { outputQuantity: 0, iskPerHour: -90 }),
    ]);
    expect(loss!.unitMargin).toBe(-80);
    expect(none!.unitMargin).toBe(0);
  });

  it('leaves margin unknown (null), never 0%, when revenue is 0', () => {
    const [row] = rankMarketWideRows([priced(1, { marginPct: null })]);
    expect(row!.marginPct).toBeNull();
  });

  it('classifies each row by the sell-order depth against its build cost', () => {
    const [deep, thin] = rankMarketWideRows([
      priced(1, { iskPerHour: 2, sellDepthIsk: 50_000_000 }),
      priced(2, { iskPerHour: 1, sellDepthIsk: 1 }),
    ]);
    expect(deep!.orderDepth).not.toBe(thin!.orderDepth);
  });
});
