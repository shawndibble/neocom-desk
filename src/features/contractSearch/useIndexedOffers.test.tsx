import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { offerIndexFromR2 } from './publicContractOfferIndex';
import { useEarlyOffers } from './useIndexedOffers';

const loadOffersForTypes = vi.hoisted(() => vi.fn());

vi.mock('./publicContractOfferIndex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publicContractOfferIndex')>()),
  loadOffersForTypes,
}));

const name = (typeId: number) => `contract-offers/types/${typeId}.h.json`;
const types = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [
    String(i + 1),
    { count: 1, cheapest: 1, objects: [name(i + 1)] },
  ])
);
const R2_INDEX = offerIndexFromR2({ lastSyncedAt: 5, types, regionIds: [] });
const ROW = { typeId: 1, contractId: 1 };

beforeEach(() => {
  loadOffersForTypes.mockReset();
  loadOffersForTypes.mockResolvedValue([ROW]);
});

describe('useEarlyOffers', () => {
  it('reads every offer for a search that names no type', async () => {
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, null, true));

    await waitFor(() => expect(result.current.rows).toEqual([ROW]));
    expect(loadOffersForTypes.mock.calls[0][1]).toBeNull();
  });

  it('has no cap on how many objects a named search may read', async () => {
    const typeIds = new Set(Array.from({ length: 20 }, (_, i) => i + 1));
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, typeIds, true));

    await waitFor(() => expect(result.current.rows).toEqual([ROW]));
  });

  it('reports a failed read, since no full snapshot is coming to replace it', async () => {
    loadOffersForTypes.mockResolvedValue(null);
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, new Set([1]), true));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.rows).toBeNull();
  });

  it('answers an index that lists no type with no offers instead of waiting', () => {
    const empty = offerIndexFromR2({ lastSyncedAt: 5, types: {}, regionIds: [] });
    const { result } = renderHook(() => useEarlyOffers(empty, null, true));

    expect(result.current.rows).toEqual([]);
  });

  it('reads nothing while disabled', () => {
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, null, false));

    expect(result.current.rows).toBeNull();
    expect(loadOffersForTypes).not.toHaveBeenCalled();
  });
});
