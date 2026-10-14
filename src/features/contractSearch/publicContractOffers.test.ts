import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { loadPublicContractOffers } from './publicContractOffers';

const getDoc = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDoc,
  getDocs: vi.fn(),
  collection: vi.fn(),
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const INDEX = {
  lastSyncedAt: 400,
  types: { '34': { count: 1, cheapest: 1, objects: ['contract-offers/types/34.h.json'] } },
  regionIds: [],
};

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  getDoc.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPublicContractOffers', () => {
  it('reports the R2 index freshness with no rows, and reads no Firestore chunk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 }))
    );

    const read = await loadPublicContractOffers(7);

    expect(read.cached?.data).toEqual({ rows: [], lastSyncedAt: 400 });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('falls back to the Firestore chunks when R2 is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));
    getDoc.mockImplementation(async (ref: { path: string }) => ({
      data: () =>
        ref.path === 'publicContractOffers/meta'
          ? { lastSyncedAt: 90, chunkCount: 1 }
          : { rows: [{ typeId: 34, contractId: 1 }], publishedAt: 90 },
    }));

    const read = await loadPublicContractOffers(7);

    expect(read.cached?.data.rows).toEqual([{ typeId: 34, contractId: 1 }]);
    expect(read.cached?.data.lastSyncedAt).toBe(90);
  });
});
