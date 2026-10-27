import { describe, it, expect } from 'vitest';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { answerContractQuery } from './contractQuery.worker';

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

const query = {
  filter: {},
  typeIds: null,
  allowedSystems: null,
  locationSystems: new Map<number, number | null>(),
  sort: true,
};

describe('answerContractQuery', () => {
  it('answers with indices and the stats as entries, echoing the request id', () => {
    const rows = [offer({ price: 9 }), offer({ price: 3 })];
    const reply = answerContractQuery(
      { snapshot: 4, rows },
      { kind: 'query', id: 7, snapshot: 4, query }
    );
    expect(reply).toEqual({
      id: 7,
      indices: Uint32Array.from([1, 0]),
      stats: [[34, { offerCount: 2, cheapest: 3 }]],
    });
  });

  it('refuses a query for a snapshot it was not given', () => {
    const reply = answerContractQuery(
      { snapshot: 4, rows: [] },
      { kind: 'query', id: 1, snapshot: 3, query }
    );
    expect(reply).toEqual({ id: 1, error: 'snapshot not loaded' });
  });
});
