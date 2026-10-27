import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { loadPublicContractOffers } from './publicContractOffers';

const getDoc = vi.hoisted(() => vi.fn());
const getDocs = vi.hoisted(() => vi.fn());

// R2 is the only store (issue #4270): these spies prove nothing reaches Firestore.
vi.mock('firebase/firestore/lite', () => ({
  getDoc,
  getDocs,
  collection: vi.fn(),
  doc: vi.fn(),
}));

const INDEX = {
  lastSyncedAt: 400,
  types: { '34': { count: 1, cheapest: 1, objects: ['contract-offers/types/34.h.json'] } },
  regionIds: [],
};

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  getDoc.mockReset();
  getDocs.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPublicContractOffers', () => {
  it('reports the R2 index freshness with no rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 }))
    );

    const read = await loadPublicContractOffers();

    expect(read.cached?.data).toEqual({ rows: [], lastSyncedAt: 400 });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('reads as unavailable when R2 is blocked, with no Firestore fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));

    const read = await loadPublicContractOffers();

    expect(read).toEqual({ cached: null, revalidating: false });
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
