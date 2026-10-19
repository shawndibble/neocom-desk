import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { loadPublicCourierContracts } from './publicCourierContracts';

const getDoc = vi.hoisted(() => vi.fn());
const getDocs = vi.hoisted(() => vi.fn());

// R2 is the only store (issue #4270): these spies prove nothing reaches Firestore.
vi.mock('firebase/firestore/lite', () => ({
  getDoc,
  getDocs,
  collection: vi.fn(),
  doc: vi.fn(),
}));

const ORIGIN = 'https://data.neocomdesk.com';
const OBJECT = 'courier-contracts/rows.h.json';
const ROW = {
  contractId: 1,
  regionId: 10000002,
  originLocationId: 60003760,
  destinationLocationId: 60008494,
  reward: 1_200_000,
  volume: 12_500,
  dateExpired: 1_900_000_000_000,
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

describe('loadPublicCourierContracts', () => {
  it('reads the snapshot from R2', async () => {
    const files: Record<string, unknown> = {
      [`${ORIGIN}/courier-contracts/index.json`]: { lastSyncedAt: 500, count: 1, object: OBJECT },
      [`${ORIGIN}/${OBJECT}`]: [ROW],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url in files
          ? new Response(JSON.stringify(files[url]), { status: 200 })
          : new Response('missing', { status: 404 })
      )
    );

    const read = await loadPublicCourierContracts();

    expect(read.cached?.data).toEqual({ rows: [ROW], lastSyncedAt: 500 });
  });

  it('reads as unavailable when R2 is unreachable, with no Firestore fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const read = await loadPublicCourierContracts();

    expect(read.cached).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
