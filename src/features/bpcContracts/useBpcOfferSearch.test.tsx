import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { SourceToggle } from './bpcSourcingUrl';
import type { BpcPrepareInput, BpcQuery, BpcSourceData } from './searchBpcOffers';
import { useBpcOfferSearch } from './useBpcOfferSearch';

const row: BpcContractRow = {
  contractId: 1,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 691,
  price: 5_000_000,
  isAuction: false,
  me: 10,
  te: 20,
  runs: 5,
  quantity: 1,
  dateExpired: Date.parse('2099-01-01T00:00:00Z'),
  isMultiType: false,
};

const data: BpcSourceData = {
  contractRows: [row],
  originals: [],
  contractLocations: new Map(),
  blueprintNames: new Map([[691, 'Rifter Blueprint']]),
  ownedBlueprints: [],
  ownedLocations: new Map(),
  marketBooksByType: new Map(),
  marketLocations: new Map(),
  marketRegionId: null,
  marketHubStationId: 60003760,
  marketTypeIds: [],
  lpRows: [],
  communityRows: [],
};
const filter = {
  typeQuery: '',
  regionId: null,
  minMe: '',
  minTe: '',
  minRuns: '',
  maxPrice: '',
  hideAuctions: false,
  hidePlex: false,
};
const sources = new Set<SourceToggle>(['contract']);
const prepareInput: BpcPrepareInput = {
  filter,
  sources,
  spaceKinds: null,
  allowedSystems: null,
};
const query: BpcQuery = { filter, selectedTypeId: null, sources };

describe('useBpcOfferSearch', () => {
  it('answers on the page, in the first render, for a small snapshot', () => {
    const { result } = renderHook(() => useBpcOfferSearch(data, prepareInput, query));
    expect(result.current.displayRows.map((r) => r.typeId)).toEqual([691]);
    expect(result.current.awaiting).toBe(false);
  });

  it('keeps the same row array while nothing it depends on changes', () => {
    const { result, rerender } = renderHook(() => useBpcOfferSearch(data, prepareInput, query));
    const first = result.current.displayRows;
    rerender();
    expect(result.current.displayRows).toBe(first);
  });
});
