import { describe, it, expect } from 'vitest';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  contractOfferPriceSummary,
  contractOfferStats,
  filterContractOffers,
  isUnpricedOffer,
  listedContractTypeOptions,
  offerAskingPrice,
} from '@/engine/contracts/contractSearch';

function offer(over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 34,
    price: 1_000,
    isAuction: false,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    ...over,
  };
}

describe('filterContractOffers', () => {
  it('passes every row through an empty filter', () => {
    const rows = [offer({ typeId: 34 }), offer({ typeId: 35 })];
    expect(filterContractOffers(rows, {})).toEqual(rows);
  });

  it('keeps only the searched types, and an empty type set matches nothing', () => {
    const rows = [offer({ typeId: 34 }), offer({ typeId: 35 })];
    expect(filterContractOffers(rows, { typeIds: new Set([35]) })).toEqual([rows[1]]);
    expect(filterContractOffers(rows, { typeIds: new Set() })).toEqual([]);
  });

  it('narrows by region and by minimum quantity', () => {
    const rows = [
      offer({ regionId: 10000002, quantity: 1 }),
      offer({ regionId: 10000043, quantity: 500 }),
    ];
    expect(filterContractOffers(rows, { regionId: 10000043 })).toEqual([rows[1]]);
    expect(filterContractOffers(rows, { minQuantity: 100 })).toEqual([rows[1]]);
  });

  it('narrows by sale kind', () => {
    const rows = [offer({ isAuction: false }), offer({ isAuction: true })];
    expect(filterContractOffers(rows, { saleKind: 'auction' })).toEqual([rows[1]]);
    expect(filterContractOffers(rows, { saleKind: 'exchange' })).toEqual([rows[0]]);
  });

  it('judges maxPrice on an auction buyout, never its starting bid', () => {
    const cheapStart = offer({ isAuction: true, price: 1, buyout: 9_000_000 });
    const noBuyout = offer({ isAuction: true, price: 1 });
    const exchange = offer({ isAuction: false, price: 9_000_000 });
    const rows = [cheapStart, noBuyout, exchange];
    // The auction that could sell for 9M is excluded by a 1M ceiling even
    // though its starting bid clears it; the one with no buyout at all has no
    // knowable eventual price, so a ceiling cannot disqualify it.
    expect(filterContractOffers(rows, { maxPrice: 1_000_000 })).toEqual([noBuyout]);
  });

  it('ignores a zero buyout on an auction too — nobody set a buyout of nothing', () => {
    // The sync only treats a *blank* buyout column as absent, so an auction
    // with no buyout arrives here as `buyout: 0`. Read as a real ceiling it
    // would slip under every maxPrice and price the row at nothing.
    const rows = [offer({ isAuction: true, price: 5_000_000, buyout: 0 })];
    expect(offerAskingPrice(rows[0])).toBe(5_000_000);
    expect(filterContractOffers(rows, { maxPrice: 1_000_000 })).toEqual(rows);
  });

  it('ignores a zero buyout on a non-auction row', () => {
    // EVE Ref emits `buyout: 0` on plain item_exchange rows; reading it as a
    // real ceiling would make every such row look free.
    const rows = [offer({ isAuction: false, price: 5_000_000, buyout: 0 })];
    expect(filterContractOffers(rows, { maxPrice: 1_000_000 })).toEqual([]);
    expect(offerAskingPrice(rows[0])).toBe(5_000_000);
  });
});

describe('offerAskingPrice', () => {
  it('is the buyout for an auction that has one, else the starting bid', () => {
    expect(offerAskingPrice(offer({ isAuction: true, price: 5, buyout: 100 }))).toBe(100);
    expect(offerAskingPrice(offer({ isAuction: true, price: 5 }))).toBe(5);
    expect(offerAskingPrice(offer({ isAuction: false, price: 42 }))).toBe(42);
  });
});

describe('isUnpricedOffer', () => {
  it('is true for a zero or negative asking price — a barter, not a genuinely free item (issue #1080)', () => {
    expect(isUnpricedOffer(offer({ price: 0 }))).toBe(true);
    expect(isUnpricedOffer(offer({ price: -1 }))).toBe(true);
  });

  it('is false for any positive asking price', () => {
    expect(isUnpricedOffer(offer({ price: 1 }))).toBe(false);
  });

  it('judges an auction on its effective asking price, same as offerAskingPrice', () => {
    expect(isUnpricedOffer(offer({ isAuction: true, price: 0, buyout: 100 }))).toBe(false);
    expect(isUnpricedOffer(offer({ isAuction: true, price: 0 }))).toBe(true);
  });
});

describe('listedContractTypeOptions', () => {
  it('is the distinct listed types, named and sorted by name', () => {
    const rows = [offer({ typeId: 35 }), offer({ typeId: 34 }), offer({ typeId: 35 })];
    const names = new Map([
      [34, 'Tritanium'],
      [35, 'Pyerite'],
    ]);
    expect(listedContractTypeOptions(rows, names)).toEqual([
      { typeId: 35, name: 'Pyerite' },
      { typeId: 34, name: 'Tritanium' },
    ]);
  });

  it('falls back to #id for a type the catalogue does not name', () => {
    expect(listedContractTypeOptions([offer({ typeId: 99 })], new Map())).toEqual([
      { typeId: 99, name: '#99' },
    ]);
  });
});

describe('contractOfferStats', () => {
  it('counts offers and tracks the cheapest asking price per type', () => {
    const rows = [
      offer({ typeId: 34, price: 500 }),
      offer({ typeId: 34, price: 200 }),
      offer({ typeId: 35, isAuction: true, price: 1, buyout: 900 }),
    ];
    const stats = contractOfferStats(rows);
    expect(stats.get(34)).toEqual({ offerCount: 2, cheapest: 200 });
    expect(stats.get(35)).toEqual({ offerCount: 1, cheapest: 900 });
  });

  it('counts a zero-price (barter) offer but never lets it win cheapest (issue #1080)', () => {
    const rows = [offer({ typeId: 34, price: 0 }), offer({ typeId: 34, price: 500 })];
    const stats = contractOfferStats(rows);
    expect(stats.get(34)).toEqual({ offerCount: 2, cheapest: 500 });
  });

  it('reports cheapest as null, not 0, when every offer of a type is unpriced', () => {
    const rows = [offer({ typeId: 34, price: 0 }), offer({ typeId: 34, price: -1 })];
    const stats = contractOfferStats(rows);
    expect(stats.get(34)).toEqual({ offerCount: 2, cheapest: null });
  });
});

describe('contractOfferPriceSummary', () => {
  it('reports zero offers as a null price rather than a free item', () => {
    expect(contractOfferPriceSummary([])).toEqual({ offerCount: 0, cheapest: null, median: null });
  });

  it('takes the median of the asking prices', () => {
    const rows = [offer({ price: 300 }), offer({ price: 100 }), offer({ price: 200 })];
    expect(contractOfferPriceSummary(rows)).toEqual({
      offerCount: 3,
      cheapest: 100,
      median: 200,
    });
  });

  it('averages the middle pair for an even count', () => {
    const rows = [offer({ price: 100 }), offer({ price: 300 })];
    expect(contractOfferPriceSummary(rows).median).toBe(200);
  });

  it('excludes a zero-price (barter) offer from cheapest/median, but still counts it as an offer (issue #1080)', () => {
    const rows = [offer({ price: 0 }), offer({ price: 300 }), offer({ price: 100 })];
    expect(contractOfferPriceSummary(rows)).toEqual({
      offerCount: 3,
      cheapest: 100,
      median: 200,
    });
  });

  it('reports cheapest and median as null when every offer is unpriced, not as a free item', () => {
    const rows = [offer({ price: 0 }), offer({ price: -1 })];
    expect(contractOfferPriceSummary(rows)).toEqual({
      offerCount: 2,
      cheapest: null,
      median: null,
    });
  });
});
