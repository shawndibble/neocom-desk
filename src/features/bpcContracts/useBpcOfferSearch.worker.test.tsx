import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { SourceToggle } from './bpcSourcingUrl';
import type { BpcOfferSearch, BpcPrepareInput, BpcQuery, BpcSourceData } from './searchBpcOffers';
import { WORKER_MIN_ROWS, useBpcOfferSearch } from './useBpcOfferSearch';

const pending: Array<{ resolve: () => void; label: string }> = [];

vi.mock('./bpcQueryService', () => ({
  SUPERSEDED: 'superseded',
  bpcQueryWorkerAvailable: () => true,
  askBpcQuery: (_data: unknown, _prep: unknown, query: { label: string }) =>
    new Promise((resolve) =>
      pending.push({ resolve: () => resolve(query.label), label: query.label })
    ),
}));
vi.mock('./searchBpcOffers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./searchBpcOffers')>()),
  expandBpcRankParts: (label: string) => label,
  assembleBpcOffers: (label: string): BpcOfferSearch => ({
    suggestions: [],
    filteredRows: [],
    bpoSourcesByType: new Map(),
    bpoByType: new Map(),
    displayRows: [{ typeId: label.length }] as never,
    summary: null,
  }),
}));

const row = { contractId: 1, typeId: 691 } as BpcContractRow;
const makeData = (): BpcSourceData =>
  ({
    contractRows: Array.from({ length: WORKER_MIN_ROWS }, () => row),
    originals: [],
    communityRows: [],
    ownedBlueprints: [],
    blueprintNames: new Map(),
    contractLocations: new Map(),
  }) as unknown as BpcSourceData;
const filter = {} as BpcQuery['filter'];
const sources = new Set<SourceToggle>(['contract']);
const prepareInput = { filter, sources, spaceKinds: null, allowedSystems: null } as BpcPrepareInput;
const makeQuery = (label: string) => ({ filter, selectedTypeId: null, sources, label }) as BpcQuery;

const settle = async () => {
  await act(async () => {
    pending.splice(0).forEach((p) => p.resolve());
  });
};

describe('useBpcOfferSearch via the worker', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('blanks on the first load, then shows the answer', async () => {
    const data = makeData();
    const query = makeQuery('aaa');
    const { result } = renderHook(() => useBpcOfferSearch(data, prepareInput, query));
    expect(result.current.awaiting).toBe(true);
    expect(result.current.displayRows).toEqual([]);
    await settle();
    expect(result.current.awaiting).toBe(false);
    expect(result.current.displayRows).toHaveLength(1);
  });

  it('keeps the last rows while a reloaded snapshot is ranked', async () => {
    const query = makeQuery('aaa');
    let data = makeData();
    const { result, rerender } = renderHook(() => useBpcOfferSearch(data, prepareInput, query));
    await settle();
    data = makeData();
    rerender();
    expect(result.current.awaiting).toBe(false);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.displayRows).toHaveLength(1);
    await settle();
    expect(result.current.refreshing).toBe(false);
  });

  it('blanks when the query changes', async () => {
    const data = makeData();
    let query = makeQuery('aaa');
    const { result, rerender } = renderHook(() => useBpcOfferSearch(data, prepareInput, query));
    await settle();
    query = makeQuery('bbbb');
    rerender();
    expect(result.current.awaiting).toBe(true);
    expect(result.current.displayRows).toEqual([]);
  });

  it('blanks when the prepare input changes', async () => {
    const data = makeData();
    const query = makeQuery('aaa');
    let prep = prepareInput;
    const { result, rerender } = renderHook(() => useBpcOfferSearch(data, prep, query));
    await settle();
    prep = { ...prepareInput };
    rerender();
    expect(result.current.awaiting).toBe(true);
  });
});
