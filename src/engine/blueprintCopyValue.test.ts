import { describe, expect, it } from 'vitest';
import type { BpcContractRow } from './contracts/bpcSearch';
import { blueprintCopyValues, type OwnedBlueprintCopyAsset } from './blueprintCopyValue';

const TYPE = 1000;

let nextContractId = 1;
function listing(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: nextContractId++,
    regionId: 10000002,
    locationId: 60003760,
    typeId: TYPE,
    price: 10_000_000,
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

function copy(overrides: Partial<OwnedBlueprintCopyAsset> = {}): OwnedBlueprintCopyAsset {
  return { itemId: 1, typeId: TYPE, me: 10, te: 20, runs: 10, ...overrides };
}

describe('blueprintCopyValues', () => {
  it('values a copy at its matching ME/TE listings, ISK per run times its own runs', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 5 })],
      [listing({ price: 10_000_000, runs: 10 })]
    );
    expect(values.get(1)).toBe(5_000_000);
  });

  it('takes the median ISK/run across matching listings, not the cheapest', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [
        listing({ price: 1_000_000, runs: 1 }),
        listing({ price: 3_000_000, runs: 1 }),
        listing({ price: 50_000_000, runs: 1 }),
      ]
    );
    expect(values.get(1)).toBe(3_000_000);
  });

  it('averages the middle two for an even count', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [listing({ price: 2_000_000, runs: 1 }), listing({ price: 4_000_000, runs: 1 })]
    );
    expect(values.get(1)).toBe(3_000_000);
  });

  it('prefers exact ME/TE listings over ME0/TE0 ones', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [listing({ price: 9_000_000, runs: 1 }), listing({ me: 0, te: 0, price: 1_000_000, runs: 1 })]
    );
    expect(values.get(1)).toBe(9_000_000);
  });

  it('falls back to ME0/TE0 listings when nothing matches its ME/TE', () => {
    const values = blueprintCopyValues(
      [copy({ me: 8, te: 16, runs: 2 })],
      [listing({ me: 0, te: 0, price: 1_000_000, runs: 1 }), listing({ me: 10, te: 20 })]
    );
    expect(values.get(1)).toBe(2_000_000);
  });

  it('is worth 0 when neither its ME/TE nor ME0/TE0 is listed', () => {
    const values = blueprintCopyValues([copy()], [listing({ me: 5, te: 10 })]);
    expect(values.get(1)).toBe(0);
  });

  it('is worth 0 with no listings of its type at all', () => {
    const values = blueprintCopyValues([copy()], [listing({ typeId: TYPE + 1 })]);
    expect(values.get(1)).toBe(0);
  });

  it('prices a copy of unknown ME/TE/runs at the ME0/TE0 median price per copy', () => {
    const values = blueprintCopyValues(
      [{ itemId: 1, typeId: TYPE }],
      [
        listing({ me: 0, te: 0, price: 4_000_000, runs: 10 }),
        listing({ me: 10, te: 20, price: 99_000_000, runs: 10 }),
      ]
    );
    expect(values.get(1)).toBe(4_000_000);
  });

  it('never reads a contract original (runs -1) as a copy price', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [listing({ runs: -1, price: 2_000_000_000 })]
    );
    expect(values.get(1)).toBe(0);
  });

  it('skips auctions, PLEX asks and zero-price barters', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [
        listing({ isAuction: true, buyout: 1_000_000, runs: 1 }),
        listing({ requestedPlex: 100, price: 1_000_000, runs: 1 }),
        listing({ price: 0, runs: 1 }),
      ]
    );
    expect(values.get(1)).toBe(0);
  });

  it('skips a contract bundling other item types — its price is not this blueprint alone', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [listing({ isMultiType: true, price: 500_000_000, runs: 1 })]
    );
    expect(values.get(1)).toBe(0);
  });

  it('divides a same-blueprint bundle by every copy it sells', () => {
    // One line of 3 copies, and one contract split over two lines of the same
    // blueprint: each row carries the whole contract's price.
    const values = blueprintCopyValues(
      [copy({ runs: 10 })],
      [
        listing({ contractId: 900, quantity: 3, runs: 10, price: 30_000_000 }),
        listing({ contractId: 901, quantity: 1, runs: 10, price: 20_000_000 }),
        listing({ contractId: 901, quantity: 1, runs: 10, price: 20_000_000 }),
      ]
    );
    // Contract 900: 1M/run; contract 901: 20M over 20 runs = 1M/run.
    expect(values.get(1)).toBe(10_000_000);
  });

  it('skips a same-type contract whose copies differ in ME/TE', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [
        listing({ contractId: 902, me: 10, te: 20, runs: 1, price: 50_000_000 }),
        listing({ contractId: 902, me: 0, te: 0, runs: 1, price: 50_000_000 }),
      ]
    );
    expect(values.get(1)).toBe(0);
  });

  it('skips a contract that also sells the original alongside copies', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [
        listing({ contractId: 903, runs: 1, price: 2_000_000_000 }),
        listing({ contractId: 903, runs: -1, price: 2_000_000_000 }),
      ]
    );
    expect(values.get(1)).toBe(0);
  });

  it('skips a whole contract when one of its copy lines states no runs', () => {
    const values = blueprintCopyValues(
      [copy({ runs: 1 })],
      [
        listing({ contractId: 904, runs: 10, price: 100_000_000 }),
        listing({ contractId: 904, runs: 0, price: 100_000_000 }),
      ]
    );
    expect(values.get(1)).toBe(0);
  });

  it('values each owned copy on its own', () => {
    const values = blueprintCopyValues(
      [copy({ itemId: 1, runs: 1 }), copy({ itemId: 2, me: 0, te: 0, runs: 3 })],
      [listing({ price: 5_000_000, runs: 1 }), listing({ me: 0, te: 0, price: 1_000_000, runs: 1 })]
    );
    expect(values.get(1)).toBe(5_000_000);
    expect(values.get(2)).toBe(3_000_000);
  });
});
