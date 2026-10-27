import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { resetR2ObjectMemo, type R2OfferIndex } from './r2OfferSnapshot';
import { loadOfferIndex, loadOffersForTypes, offerIndexFromR2 } from './publicContractOfferIndex';

const getDoc = vi.hoisted(() => vi.fn());

// R2 is the only store (issue #4270): this spy proves nothing reaches Firestore.
vi.mock('firebase/firestore/lite', () => ({ getDoc, doc: vi.fn() }));

const row = (typeId: number, contractId: number) => ({ typeId, contractId });

const ORIGIN = 'https://data.neocomdesk.com';
const name = (typeId: number) => `contract-offers/types/${typeId}.h.json`;
const R2_INDEX: R2OfferIndex = {
  lastSyncedAt: 300,
  types: {
    '34': { count: 1, cheapest: 10, objects: [name(34)] },
    '35': { count: 2, cheapest: 20, objects: [name(35)] },
  },
  regionIds: [10000002],
};

function serveR2(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) =>
    url in files
      ? new Response(JSON.stringify(files[url]), { status: 200 })
      : new Response('missing', { status: 404 })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  resetR2ObjectMemo();
  getDoc.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadOfferIndex', () => {
  it('reads the R2 index', async () => {
    serveR2({ [`${ORIGIN}/contract-offers/index.json`]: R2_INDEX });

    const index = await loadOfferIndex();

    expect(index?.lastSyncedAt).toBe(300);
    expect(index?.types.get(35)).toEqual({ typeId: 35, count: 2, cheapest: 20 });
    expect(index?.regionIds).toEqual([10000002]);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('is null when R2 is unreachable, with no Firestore fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await loadOfferIndex()).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe('loadOffersForTypes', () => {
  it('reads just the searched type object', async () => {
    const fetchMock = serveR2({ [`${ORIGIN}/${name(34)}`]: [row(34, 1)] });

    const rows = await loadOffersForTypes(offerIndexFromR2(R2_INDEX), new Set([34]));

    expect(rows).toEqual([row(34, 1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is null when R2 stops answering mid-session, with no Firestore fallback', async () => {
    serveR2({});

    expect(await loadOffersForTypes(offerIndexFromR2(R2_INDEX), new Set([34]))).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
