import { describe, it, expect } from 'vitest';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { SourceToggle } from './bpcSourcingUrl';
import type { BpcSourcingFilter } from './bpcActiveFilters';
import {
  acceptBpcPrepareInput,
  answerBpcQuery,
  emptyBpcQueryState,
  loadBpcQueryData,
} from './bpcQuery.worker';
import {
  assembleBpcOffers,
  expandBpcRankParts,
  rankBpcOffers,
  prepareBpcOffers,
  type BpcPrepareInput,
  type BpcQuery,
  type BpcSourceData,
} from './searchBpcOffers';

const RIFTER = 691;
const CARACAL = 950;

function contract(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: RIFTER,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    isMultiType: false,
    ...overrides,
  };
}

const data: BpcSourceData = {
  contractRows: [
    contract({ contractId: 1 }),
    contract({ contractId: 2, typeId: CARACAL, price: 1 }),
    contract({ contractId: 3, me: 2 }),
  ],
  originals: [contract({ contractId: 9, runs: -1 }), contract({ contractId: 10, runs: -1, me: 0 })],
  contractLocations: new Map(),
  blueprintNames: new Map([
    [RIFTER, 'Rifter Blueprint'],
    [CARACAL, 'Caracal Blueprint'],
  ]),
  ownedBlueprints: [],
  ownedLocations: new Map(),
  marketBooksByType: new Map(),
  marketLocations: new Map(),
  marketRegionId: 10000002,
  marketHubStationId: 60003760,
  marketTypeIds: [],
  lpRows: [],
  communityRows: [],
};

const filter: BpcSourcingFilter = {
  typeQuery: 'rif',
  regionId: null,
  minMe: '5',
  minTe: '',
  minRuns: '',
  maxPrice: '',
  hideAuctions: false,
  hidePlex: false,
};
const sources = new Set<SourceToggle>(['contract', 'contractBpo']);
const prepareInput: BpcPrepareInput = {
  filter: { ...filter, typeQuery: undefined } as never,
  sources,
  spaceKinds: null,
  allowedSystems: null,
};
const query: BpcQuery = { filter, selectedTypeId: null, sources };

function loaded() {
  const state = emptyBpcQueryState();
  const { contractRows, originals, ...rest } = data;
  loadBpcQueryData(state, { kind: 'rows', contractRows, originals });
  loadBpcQueryData(state, { kind: 'rest', rest });
  return state;
}

describe('answerBpcQuery', () => {
  it('answers like the page does once indices are expanded', () => {
    const reply = answerBpcQuery(loaded(), {
      kind: 'query',
      id: 3,
      prepareVersion: 1,
      prepareInput,
      query,
    });
    if (!('parts' in reply)) throw new Error('expected an answer');
    expect(reply.id).toBe(3);
    expect([...reply.parts.filteredIndices]).toEqual([0]);
    const viaWorker = assembleBpcOffers(expandBpcRankParts(reply.parts, data), data, sources);
    const onPage = rankBpcOffers(prepareBpcOffers(data, prepareInput), data, query);
    expect(viaWorker).toEqual(onPage);
    expect(viaWorker.filteredRows[0]).toBe(data.contractRows[0]);
  });

  it('keeps stage 1 input from a query that was superseded before it ran', () => {
    const state = loaded();
    acceptBpcPrepareInput(state, {
      kind: 'query',
      id: 1,
      prepareVersion: 4,
      prepareInput,
      query,
    });
    const reply = answerBpcQuery(state, { kind: 'query', id: 2, prepareVersion: 4, query });
    expect('parts' in reply).toBe(true);
  });

  it('refuses a query before data, or for an unknown prepare version', () => {
    expect(
      answerBpcQuery(emptyBpcQueryState(), {
        kind: 'query',
        id: 1,
        prepareVersion: 1,
        prepareInput,
        query,
      })
    ).toEqual({ id: 1, error: 'data not loaded' });
    expect(answerBpcQuery(loaded(), { kind: 'query', id: 2, prepareVersion: 7, query })).toEqual({
      id: 2,
      error: 'prepare input not loaded',
    });
  });
});
