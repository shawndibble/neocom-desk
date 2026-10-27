import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractOfferQuery } from '@/engine/contracts/contractSearchQuery';
import { useContractOfferQuery } from './useContractOfferQuery';

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

const query: ContractOfferQuery = {
  filter: {},
  typeIds: null,
  allowedSystems: null,
  locationSystems: new Map(),
  sort: true,
};

describe('useContractOfferQuery', () => {
  it('answers on the page, in the first render, for a small snapshot', () => {
    const rows = [offer({ price: 9 }), offer({ price: 3 })];
    const { result } = renderHook(() => useContractOfferQuery(rows, query));
    expect(result.current.displayRows).toEqual([rows[1], rows[0]]);
    expect(result.current.stats.get(34)).toEqual({ offerCount: 2, cheapest: 3 });
    expect(result.current.awaitingFirst).toBe(false);
  });

  it('keeps the same row array while nothing it depends on changes', () => {
    const rows = [offer()];
    const { result, rerender } = renderHook(() => useContractOfferQuery(rows, query));
    const first = result.current.displayRows;
    rerender();
    expect(result.current.displayRows).toBe(first);
  });
});
