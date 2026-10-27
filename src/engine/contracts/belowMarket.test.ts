import { describe, it, expect } from 'vitest';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  belowMarketContracts,
  belowMarketPriceTypeIds,
  isBelowMarketCandidate,
  type BelowMarketPricing,
} from '@/engine/contracts/belowMarket';

const RIFTER = 587;
const DC2 = 2048;
const GILA_BP = 17716;
const ABYSSAL = 47408;
const NO_MARKET = 99999;

function offer(over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: RIFTER,
    price: 1_000,
    isAuction: false,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    ...over,
  };
}

function bpc(over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return offer({ typeId: GILA_BP, isBlueprintCopy: true, me: 10, te: 20, runs: 1, ...over });
}

/** No tax unless a test sets one, so the arithmetic below reads plainly. */
function pricing(over: Partial<BelowMarketPricing> = {}): BelowMarketPricing {
  return {
    bestBuy: new Map([
      [RIFTER, 1_000],
      [DC2, 500],
      [GILA_BP, 1_000_000_000],
    ]),
    salesTaxPct: 0,
    plexPrice: null,
    isAbyssalType: (typeId) => typeId === ABYSSAL,
    ...over,
  };
}

describe('belowMarketContracts', () => {
  it('values every line at best buy and takes the asking price once per contract', () => {
    const rows = [
      offer({ typeId: RIFTER, quantity: 2, price: 1_500 }),
      offer({ typeId: DC2, quantity: 4, price: 1_500 }),
    ];
    const [result] = belowMarketContracts(rows, pricing());
    expect(result).toMatchObject({
      contractId: 1,
      value: 4_000,
      asking: 1_500,
      profit: 2_500,
      lines: 2,
      source: { kind: 'market' },
    });
  });

  it('subtracts sales tax from market-valued lines', () => {
    const rows = [offer({ quantity: 10, price: 5_000 })];
    const [result] = belowMarketContracts(rows, pricing({ salesTaxPct: 7.5 }));
    expect(result?.value).toBeCloseTo(9_250);
    expect(result?.profit).toBeCloseTo(4_250);
  });

  it('leads with the most valuable line', () => {
    const rows = [
      offer({ typeId: DC2, quantity: 1, price: 100 }),
      offer({ typeId: RIFTER, quantity: 3, price: 100 }),
    ];
    expect(belowMarketContracts(rows, pricing())[0]?.lead.typeId).toBe(RIFTER);
  });

  it('keeps only contracts worth more than they ask, best profit first', () => {
    const rows = [
      offer({ contractId: 1, quantity: 1, price: 900 }),
      offer({ contractId: 2, quantity: 1, price: 1_000 }),
      offer({ contractId: 3, quantity: 1, price: 2_000 }),
      offer({ contractId: 4, quantity: 1, price: 500 }),
    ];
    expect(belowMarketContracts(rows, pricing()).map((c) => c.contractId)).toEqual([4, 1]);
  });

  it('leaves out a contract that asks for items', () => {
    const rows = [offer({ price: 1, requestsItems: true })];
    expect(belowMarketContracts(rows, pricing())).toEqual([]);
  });

  it('leaves out an auction with no buyout, and treats a zero buyout as none', () => {
    const rows = [
      offer({ contractId: 1, price: 1, isAuction: true }),
      offer({ contractId: 2, price: 1, isAuction: true, buyout: 0 }),
    ];
    expect(belowMarketContracts(rows, pricing())).toEqual([]);
  });

  it('prices an auction with a buyout at the buyout', () => {
    const rows = [offer({ price: 1, isAuction: true, buyout: 600 })];
    expect(belowMarketContracts(rows, pricing())[0]).toMatchObject({ asking: 600, profit: 400 });
  });

  it('leaves out a zero-price barter', () => {
    expect(belowMarketContracts([offer({ price: 0 })], pricing())).toEqual([]);
  });

  it('converts a PLEX ask, and leaves it out while no PLEX price is known', () => {
    const rows = [offer({ quantity: 10, price: 1_000, requestedPlex: 2 })];
    expect(belowMarketContracts(rows, pricing())).toEqual([]);
    const [result] = belowMarketContracts(rows, pricing({ plexPrice: 3_000 }));
    expect(result).toMatchObject({ asking: 7_000, profit: 3_000 });
  });

  it('values abyssal lines at zero', () => {
    const rows = [
      offer({ typeId: ABYSSAL, quantity: 1, price: 900 }),
      offer({ typeId: RIFTER, quantity: 1, price: 900 }),
    ];
    const [result] = belowMarketContracts(
      rows,
      pricing({
        bestBuy: new Map([
          [RIFTER, 1_000],
          [ABYSSAL, 1_000_000],
        ]),
      })
    );
    expect(result?.value).toBe(1_000);
  });

  describe('items with no market', () => {
    const others = (count: number, unit: number) =>
      Array.from({ length: count }, (_, i) =>
        offer({ contractId: 100 + i, typeId: NO_MARKET, quantity: 2, price: unit * 2 * (i + 1) })
      );

    it('uses the cheapest other single-type offer when at least three exist', () => {
      const rows = [
        offer({ contractId: 1, typeId: NO_MARKET, quantity: 5, price: 100 }),
        ...others(3, 50),
      ];
      const [result] = belowMarketContracts(rows, pricing()).filter((c) => c.contractId === 1);
      expect(result).toMatchObject({ value: 250, source: { kind: 'offers', offerCount: 3 } });
    });

    it('values the line at zero with fewer than three other offers', () => {
      const rows = [
        offer({ contractId: 1, typeId: NO_MARKET, quantity: 5, price: 1 }),
        ...others(2, 50),
      ];
      expect(belowMarketContracts(rows, pricing()).some((c) => c.contractId === 1)).toBe(false);
    });

    it('never counts the contract being valued as its own comparable', () => {
      // Contract 1 is the cheapest single-type offer; its value comes from the
      // next cheapest, and only three others count toward the minimum.
      const rows = [
        offer({ contractId: 1, typeId: NO_MARKET, quantity: 2, price: 2 }),
        ...others(3, 50),
      ];
      const [result] = belowMarketContracts(rows, pricing()).filter((c) => c.contractId === 1);
      expect(result).toMatchObject({ value: 100, source: { kind: 'offers', offerCount: 3 } });
    });

    it('ignores multi-type contracts, auctions, PLEX asks, barters and item asks as comparables', () => {
      const rows = [
        offer({ contractId: 1, typeId: NO_MARKET, quantity: 1, price: 10 }),
        offer({ contractId: 2, typeId: NO_MARKET, price: 20 }),
        offer({ contractId: 2, typeId: RIFTER, price: 20 }),
        offer({ contractId: 3, typeId: NO_MARKET, price: 20, isAuction: true, buyout: 20 }),
        offer({ contractId: 4, typeId: NO_MARKET, price: 20, requestedPlex: 1 }),
        offer({ contractId: 5, typeId: NO_MARKET, price: 0 }),
        offer({ contractId: 6, typeId: NO_MARKET, price: 20, requestsItems: true }),
        offer({ contractId: 7, typeId: NO_MARKET, price: 20 }),
        offer({ contractId: 8, typeId: NO_MARKET, price: 20 }),
      ];
      const result = belowMarketContracts(rows, pricing({ plexPrice: 1 }));
      expect(result.some((c) => c.contractId === 1)).toBe(false);
    });

    it('prices a blueprint copy at ISK per run of the same blueprint and ME/TE, never at the original’s market price', () => {
      const rows = [
        bpc({ contractId: 1, runs: 3, price: 100 }),
        bpc({ contractId: 2, runs: 2, price: 100 }),
        bpc({ contractId: 3, runs: 1, price: 70 }),
        bpc({ contractId: 4, runs: 5, quantity: 2, price: 1_000 }),
        // Different ME: not the same thing.
        bpc({ contractId: 5, runs: 10, me: 0, price: 10 }),
      ];
      const [result] = belowMarketContracts(rows, pricing()).filter((c) => c.contractId === 1);
      // Others at 50, 70, 100 ISK/run; cheapest 50 × 3 runs.
      expect(result).toMatchObject({ value: 150, source: { kind: 'offers', offerCount: 3 } });
    });

    it('does not count a contract that also sells the original as a copy comparable', () => {
      const rows = [
        bpc({ contractId: 1, runs: 1, price: 1 }),
        bpc({ contractId: 2, price: 50 }),
        bpc({ contractId: 3, price: 50 }),
        bpc({ contractId: 4, price: 50 }),
        offer({ contractId: 4, typeId: GILA_BP, me: 10, te: 20 }),
      ];
      expect(belowMarketContracts(rows, pricing()).some((c) => c.contractId === 1)).toBe(false);
    });

    it('names the weakest comparable count when lines mix market and offer values', () => {
      const rows = [
        offer({ contractId: 1, typeId: RIFTER, quantity: 1, price: 10 }),
        offer({ contractId: 1, typeId: NO_MARKET, quantity: 1, price: 10 }),
        bpc({ contractId: 1, price: 10 }),
        ...others(4, 50),
        bpc({ contractId: 20, price: 50 }),
        bpc({ contractId: 21, price: 50 }),
        bpc({ contractId: 22, price: 50 }),
      ];
      const [result] = belowMarketContracts(rows, pricing()).filter((c) => c.contractId === 1);
      expect(result?.source).toEqual({ kind: 'offers', offerCount: 3 });
    });
  });
});

describe('isBelowMarketCandidate', () => {
  it('accepts a plain priced exchange and rejects every excluded shape', () => {
    expect(isBelowMarketCandidate(offer(), null)).toBe(true);
    expect(isBelowMarketCandidate(offer({ requestsItems: true }), null)).toBe(false);
    expect(isBelowMarketCandidate(offer({ isAuction: true }), null)).toBe(false);
    expect(isBelowMarketCandidate(offer({ price: 0 }), null)).toBe(false);
    expect(isBelowMarketCandidate(offer({ requestedPlex: 1 }), null)).toBe(false);
    expect(isBelowMarketCandidate(offer({ requestedPlex: 1 }), 5)).toBe(true);
  });
});

describe('belowMarketPriceTypeIds', () => {
  it('lists the market types of candidate contracts only, never copies or abyssal types', () => {
    const rows = [
      offer({ contractId: 1, typeId: RIFTER }),
      offer({ contractId: 1, typeId: ABYSSAL }),
      bpc({ contractId: 1 }),
      offer({ contractId: 2, typeId: DC2, requestsItems: true }),
    ];
    expect(belowMarketPriceTypeIds(rows, null, (id) => id === ABYSSAL)).toEqual([RIFTER]);
  });
});
