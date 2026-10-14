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

describe('useEarlyOffers with an R2 index', () => {
  it('reads every listed type for a search that names none, since no full snapshot is downloading', async () => {
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, null, 7, true));

    await waitFor(() => expect(result.current.rows).toEqual([ROW]));
    const asked = loadOffersForTypes.mock.calls[0][1] as ReadonlySet<number>;
    expect(asked.size).toBe(20);
  });

  it('has no cap on how many objects a named search may read', async () => {
    const typeIds = new Set(Array.from({ length: 20 }, (_, i) => i + 1));
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, typeIds, 7, true));

    await waitFor(() => expect(result.current.rows).toEqual([ROW]));
  });

  it('reads nothing while disabled', () => {
    const { result } = renderHook(() => useEarlyOffers(R2_INDEX, null, 7, false));

    expect(result.current.rows).toBeNull();
    expect(loadOffersForTypes).not.toHaveBeenCalled();
  });
});

describe('useEarlyOffers with a Firestore index', () => {
  it('still waits for the full snapshot when no type is named', () => {
    const firestore = { ...R2_INDEX, r2: undefined };
    const { result } = renderHook(() => useEarlyOffers(firestore, null, 7, true));

    expect(result.current.rows).toBeNull();
    expect(loadOffersForTypes).not.toHaveBeenCalled();
  });
});
