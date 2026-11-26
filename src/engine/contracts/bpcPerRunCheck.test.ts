import { describe, expect, it } from 'vitest';
import type { BpcContractRow } from './bpcSearch';
import { bpcPeerDiffs, bpcPerRunCheck } from './bpcPerRunCheck';

function row(overrides: Partial<BpcContractRow>): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 24703,
    price: 8_500_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 10,
    quantity: 1,
    dateExpired: 0,
    isMultiType: false,
    ...overrides,
  };
}

describe('bpcPerRunCheck', () => {
  const subject = row({ contractId: 1 });
  const similar = [
    row({ contractId: 2, price: 7_900_000 }),
    row({ contractId: 3, price: 9_200_000 }),
    row({ contractId: 4, price: 5_000_000, runs: 5, me: 9, te: 18 }),
  ];

  it('compares this copy per run with the median and cheapest of similar copies', () => {
    const result = bpcPerRunCheck(subject, [subject, ...similar]);
    expect(result).toMatchObject({
      perRun: 850_000,
      medianPerRun: 920_000,
      cheapestPerRun: 790_000,
      count: 3,
    });
    expect(result?.diff).toBeCloseTo(-7.61, 2);
  });

  it('leaves out other blueprints, bundles, barters and copies outside the ME/TE window', () => {
    const noise = [
      row({ contractId: 5, typeId: 999, price: 1 }),
      row({ contractId: 6, price: 1, isMultiType: true }),
      row({ contractId: 7, price: 0 }),
      row({ contractId: 8, price: 1, me: 4 }),
      row({ contractId: 9, price: 1, te: 8 }),
    ];
    expect(bpcPerRunCheck(subject, [...similar, ...noise])).toMatchObject({
      medianPerRun: 920_000,
      count: 3,
    });
  });

  it('is null with fewer than three similar copies: two offers are not a going rate', () => {
    expect(bpcPerRunCheck(subject, similar.slice(0, 2))).toBeNull();
  });

  it('is null when this listing has no per-run rate of its own', () => {
    expect(bpcPerRunCheck(row({ price: 0 }), similar)).toBeNull();
    expect(bpcPerRunCheck(row({ isMultiType: true }), similar)).toBeNull();
  });
});

describe('bpcPeerDiffs', () => {
  const subject = row({ contractId: 1 });
  const similar = [
    row({ contractId: 2, price: 7_900_000 }),
    row({ contractId: 3, price: 9_200_000 }),
    row({ contractId: 4, price: 5_000_000, runs: 5, me: 9, te: 18 }),
  ];

  it('answers what bpcPerRunCheck says, for any row of the pool', () => {
    const pool = [subject, ...similar];
    const diffOf = bpcPeerDiffs(pool);
    for (const r of pool) expect(diffOf(r)).toEqual(bpcPerRunCheck(r, pool)?.diff ?? null);
    expect(diffOf(subject)).toBeCloseTo(-7.61, 2);
  });

  it('is null with fewer than three similar copies, never 0', () => {
    expect(bpcPeerDiffs([subject, ...similar.slice(0, 2)])(subject)).toBeNull();
  });

  it('is null for a bundle, a barter and a blueprint with no peers at all', () => {
    const diffOf = bpcPeerDiffs([subject, ...similar]);
    expect(diffOf(row({ contractId: 50, isMultiType: true }))).toBeNull();
    expect(diffOf(row({ contractId: 51, price: 0 }))).toBeNull();
    expect(diffOf(row({ contractId: 52, typeId: 999 }))).toBeNull();
  });

  it('judges a row against the whole pool it was given, not a narrower list', () => {
    expect(bpcPeerDiffs([...similar])(subject)).toBeCloseTo(-7.61, 2);
  });
});
