import { describe, it, expect } from 'vitest';
import {
  EMPTY_BPC_SEARCH_FILTER,
  filterBpcContracts,
  blueprintOfferStats,
  bpcPriceSummary,
  cheapestByRegion,
  effectivePrice,
  listedBlueprintTypeOptions,
  type BpcContractRow,
} from './bpcSearch';

function row(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 32858,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: Date.parse('2026-09-10T00:00:00Z'),
    ...overrides,
  };
}

describe('filterBpcContracts', () => {
  it('returns every row for the empty filter', () => {
    const rows = [row({ contractId: 1 }), row({ contractId: 2 })];
    expect(filterBpcContracts(rows, EMPTY_BPC_SEARCH_FILTER)).toEqual(rows);
  });

  it('narrows to the given type ids', () => {
    const rows = [row({ contractId: 1, typeId: 100 }), row({ contractId: 2, typeId: 200 })];
    const filtered = filterBpcContracts(rows, {
      ...EMPTY_BPC_SEARCH_FILTER,
      typeIds: new Set([200]),
    });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('an empty (but non-null) type id set matches nothing — a search with zero results, not "unfiltered"', () => {
    const rows = [row({ contractId: 1, typeId: 100 })];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, typeIds: new Set() });
    expect(filtered).toEqual([]);
  });

  it('narrows to one region', () => {
    const rows = [
      row({ contractId: 1, regionId: 10000002 }),
      row({ contractId: 2, regionId: 10000043 }),
    ];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, regionId: 10000043 });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('keeps only rows at or above the minimum ME', () => {
    const rows = [row({ contractId: 1, me: 9 }), row({ contractId: 2, me: 10 })];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, minMe: 10 });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('keeps only rows at or above the minimum TE', () => {
    const rows = [row({ contractId: 1, te: 18 }), row({ contractId: 2, te: 20 })];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, minTe: 20 });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('keeps only rows at or above the minimum runs', () => {
    const rows = [row({ contractId: 1, runs: 1 }), row({ contractId: 2, runs: 10 })];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, minRuns: 10 });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('keeps only rows at or below the maximum price', () => {
    const rows = [
      row({ contractId: 1, price: 1_000_000 }),
      row({ contractId: 2, price: 9_000_000 }),
    ];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, maxPrice: 5_000_000 });
    expect(filtered.map((r) => r.contractId)).toEqual([1]);
  });

  it('an auction with no flat price is judged on its buyout against maxPrice', () => {
    const rows = [
      row({ contractId: 1, isAuction: true, price: 100, buyout: 9_000_000 }),
      row({ contractId: 2, isAuction: true, price: 100, buyout: 1_000_000 }),
    ];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, maxPrice: 5_000_000 });
    expect(filtered.map((r) => r.contractId)).toEqual([2]);
  });

  it('an auction with no buyout at all always passes maxPrice — its final price is unknown, not disqualifying', () => {
    const rows = [row({ contractId: 1, isAuction: true, price: 100 })];
    const filtered = filterBpcContracts(rows, { ...EMPTY_BPC_SEARCH_FILTER, maxPrice: 1 });
    expect(filtered.map((r) => r.contractId)).toEqual([1]);
  });

  it('combines every active criterion (AND, not OR)', () => {
    const rows = [
      row({ contractId: 1, typeId: 100, regionId: 10000002, me: 10, te: 20, runs: 5 }),
      row({ contractId: 2, typeId: 100, regionId: 10000043, me: 10, te: 20, runs: 5 }),
      row({ contractId: 3, typeId: 100, regionId: 10000002, me: 0, te: 20, runs: 5 }),
    ];
    const filtered = filterBpcContracts(rows, {
      ...EMPTY_BPC_SEARCH_FILTER,
      typeIds: new Set([100]),
      regionId: 10000002,
      minMe: 10,
    });
    expect(filtered.map((r) => r.contractId)).toEqual([1]);
  });
});

describe('listedBlueprintTypeOptions', () => {
  it('names and de-duplicates the distinct type ids present in the rows', () => {
    const rows = [
      row({ contractId: 1, typeId: 100 }),
      row({ contractId: 2, typeId: 100 }),
      row({ contractId: 3, typeId: 200 }),
    ];
    const names = new Map([
      [100, 'Rifter Blueprint'],
      [200, 'Catalyst Blueprint'],
    ]);
    expect(listedBlueprintTypeOptions(rows, names)).toEqual([
      { typeId: 200, name: 'Catalyst Blueprint' },
      { typeId: 100, name: 'Rifter Blueprint' },
    ]);
  });

  it('falls back to #typeId when the SDE has no name for it', () => {
    const rows = [row({ contractId: 1, typeId: 999 })];
    expect(listedBlueprintTypeOptions(rows, new Map())).toEqual([{ typeId: 999, name: '#999' }]);
  });

  it('is empty given no rows', () => {
    expect(listedBlueprintTypeOptions([], new Map())).toEqual([]);
  });
});

describe('effectivePrice', () => {
  it('is the plain price for an item exchange', () => {
    expect(effectivePrice(row({ price: 5_000_000 }))).toBe(5_000_000);
  });

  it('is the buyout for an auction that has one — what the row actually costs', () => {
    expect(effectivePrice(row({ isAuction: true, price: 1_000, buyout: 9_000_000 }))).toBe(
      9_000_000
    );
  });

  it('falls back to the starting bid for an auction with no buyout', () => {
    expect(effectivePrice(row({ isAuction: true, price: 1_000 }))).toBe(1_000);
  });
});

describe('blueprintOfferStats', () => {
  it('counts offers and keeps the best ME/TE per type', () => {
    const stats = blueprintOfferStats([
      row({ contractId: 1, typeId: 100, me: 8, te: 14, price: 9_000_000 }),
      row({ contractId: 2, typeId: 100, me: 10, te: 20, price: 12_000_000 }),
      row({ contractId: 3, typeId: 200, me: 4, te: 6, price: 3_000_000 }),
    ]);
    expect(stats.get(100)).toEqual({ offerCount: 2, bestMe: 10, bestTe: 20 });
    expect(stats.get(200)).toEqual({ offerCount: 1, bestMe: 4, bestTe: 6 });
  });

  it('takes the best ME and the best TE independently — they need not come from one row', () => {
    const stats = blueprintOfferStats([
      row({ contractId: 1, typeId: 100, me: 10, te: 0 }),
      row({ contractId: 2, typeId: 100, me: 0, te: 20 }),
    ]);
    expect(stats.get(100)?.bestMe).toBe(10);
    expect(stats.get(100)?.bestTe).toBe(20);
  });

  it('counts one offer per contract row, not per copy — a quantity-3 contract is one offer', () => {
    const stats = blueprintOfferStats([row({ contractId: 1, typeId: 100, quantity: 3 })]);
    expect(stats.get(100)?.offerCount).toBe(1);
  });

  it('is empty given no rows', () => {
    expect(blueprintOfferStats([]).size).toBe(0);
  });
});

describe('bpcPriceSummary', () => {
  it('summarises count, cheapest, median and the best ME/TE on offer', () => {
    const summary = bpcPriceSummary([
      row({ contractId: 1, price: 5_000_000, me: 10, te: 12 }),
      row({ contractId: 2, price: 1_000_000, me: 2, te: 20 }),
      row({ contractId: 3, price: 3_000_000, me: 4, te: 4 }),
    ]);
    expect(summary).toEqual({
      offerCount: 3,
      cheapest: 1_000_000,
      median: 3_000_000,
      bestMe: 10,
      bestTe: 20,
    });
  });

  it('averages the middle pair for an even number of offers', () => {
    const summary = bpcPriceSummary([
      row({ contractId: 1, price: 1_000_000 }),
      row({ contractId: 2, price: 2_000_000 }),
      row({ contractId: 3, price: 3_000_000 }),
      row({ contractId: 4, price: 6_000_000 }),
    ]);
    expect(summary.median).toBe(2_500_000);
  });

  it('reports nulls rather than zeroes for no offers — a missing price is not a free one', () => {
    expect(bpcPriceSummary([])).toEqual({
      offerCount: 0,
      cheapest: null,
      median: null,
      bestMe: null,
      bestTe: null,
    });
  });
});

describe('cheapestByRegion', () => {
  it('gives one entry per region, cheapest first', () => {
    expect(
      cheapestByRegion([
        row({ contractId: 1, regionId: 10000002, price: 4_000_000 }),
        row({ contractId: 2, regionId: 10000002, price: 2_000_000 }),
        row({ contractId: 3, regionId: 10000043, price: 1_000_000 }),
      ])
    ).toEqual([
      { regionId: 10000043, cheapest: 1_000_000, offerCount: 1 },
      { regionId: 10000002, cheapest: 2_000_000, offerCount: 2 },
    ]);
  });

  it('prices an auction at its buyout', () => {
    expect(
      cheapestByRegion([
        row({ contractId: 1, regionId: 10000002, isAuction: true, price: 1, buyout: 7_000_000 }),
      ])
    ).toEqual([{ regionId: 10000002, cheapest: 7_000_000, offerCount: 1 }]);
  });

  it('is empty given no rows', () => {
    expect(cheapestByRegion([])).toEqual([]);
  });
});
