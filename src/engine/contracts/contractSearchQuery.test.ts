import { describe, it, expect } from 'vitest';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  contractOfferStats,
  filterContractOffers,
  sortableOfferPrice,
} from '@/engine/contracts/contractSearch';
import {
  queryContractOffers,
  type ContractOfferQuery,
} from '@/engine/contracts/contractSearchQuery';

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

function query(over: Partial<ContractOfferQuery> = {}): ContractOfferQuery {
  return {
    filter: {},
    typeIds: null,
    allowedSystems: null,
    locationSystems: new Map(),
    sort: true,
    ...over,
  };
}

const pick = (rows: readonly PublicContractOfferRow[], indices: Uint32Array) =>
  [...indices].map((i) => rows[i]);

describe('queryContractOffers', () => {
  it('answers with the indices of the rows that pass, cheapest first', () => {
    const rows = [offer({ price: 300 }), offer({ price: 100 }), offer({ price: 200 })];
    const { indices } = queryContractOffers(rows, query());
    expect(indices).toBeInstanceOf(Uint32Array);
    expect([...indices]).toEqual([1, 2, 0]);
  });

  it('keeps the snapshot order of equal prices', () => {
    const rows = [offer({ price: 5, contractId: 1 }), offer({ price: 5, contractId: 2 })];
    expect([...queryContractOffers(rows, query()).indices]).toEqual([0, 1]);
  });

  it('sorts an unpriced (barter) row last, not first', () => {
    const rows = [offer({ price: 0 }), offer({ price: 50 }), offer({ price: 0 })];
    expect([...queryContractOffers(rows, query()).indices]).toEqual([1, 0, 2]);
  });

  it('leaves the snapshot order alone when sort is off', () => {
    const rows = [offer({ price: 300 }), offer({ price: 100 })];
    expect([...queryContractOffers(rows, query({ sort: false })).indices]).toEqual([0, 1]);
  });

  it('matches filterContractOffers for the non-type filter and the type set', () => {
    const rows = [
      offer({ typeId: 34, regionId: 1, price: 10 }),
      offer({ typeId: 35, regionId: 1, price: 20, isAuction: true }),
      offer({ typeId: 35, regionId: 2, price: 30 }),
      offer({ typeId: 36, regionId: 1, price: 40 }),
    ];
    const filter = { regionId: 1, hideAuctions: true };
    const typeIds = new Set([34, 36]);
    const { indices } = queryContractOffers(rows, query({ filter, typeIds }));
    expect(pick(rows, indices)).toEqual(
      filterContractOffers(filterContractOffers(rows, filter), { typeIds })
    );
  });

  it('an empty type set matches nothing, null matches everything', () => {
    const rows = [offer(), offer()];
    expect(queryContractOffers(rows, query({ typeIds: new Set() })).indices).toHaveLength(0);
    expect(queryContractOffers(rows, query({ typeIds: null })).indices).toHaveLength(2);
  });

  it('computes stats over the non-type rows, ignoring the type set', () => {
    const rows = [
      offer({ typeId: 34, price: 10 }),
      offer({ typeId: 34, price: 5 }),
      offer({ typeId: 35, price: 7, regionId: 2 }),
    ];
    const { stats } = queryContractOffers(
      rows,
      query({ filter: { regionId: 10000002 }, typeIds: new Set([35]) })
    );
    expect(stats).toEqual(contractOfferStats([rows[0], rows[1]]));
  });

  it('prices PLEX asks at the filter plexPrice in the sort and the stats', () => {
    const rows = [offer({ price: 100, requestedPlex: 2 }), offer({ price: 150, typeId: 35 })];
    const { indices, stats } = queryContractOffers(rows, query({ filter: { plexPrice: 30 } }));
    // 100 + 2 × 30 = 160 > 150
    expect([...indices]).toEqual([1, 0]);
    expect(stats.get(34)?.cheapest).toBe(160);
    expect(sortableOfferPrice(rows[0], 30)).toBe(160);
  });

  describe('jump range', () => {
    const rows = [
      offer({ locationId: 1, price: 1 }), // in range
      offer({ locationId: 2, price: 2 }), // placed, out of range
      offer({ locationId: 3, price: 3 }), // placed in no system (structure)
      offer({ locationId: 4, price: 4 }), // still resolving
    ];
    const locationSystems = new Map<number, number | null>([
      [1, 100],
      [2, 200],
      [3, null],
    ]);

    it('drops placed rows outside the range and unplaceable ones, keeps resolving ones', () => {
      const { indices } = queryContractOffers(
        rows,
        query({ allowedSystems: new Set([100]), locationSystems })
      );
      expect([...indices]).toEqual([0, 3]);
    });

    it('counts only the in-range rows in the stats', () => {
      const { stats } = queryContractOffers(
        rows,
        query({ allowedSystems: new Set([100]), locationSystems })
      );
      expect(stats.get(34)?.offerCount).toBe(2);
    });

    it('does nothing without a range', () => {
      expect(queryContractOffers(rows, query({ locationSystems })).indices).toHaveLength(4);
    });
  });
});
