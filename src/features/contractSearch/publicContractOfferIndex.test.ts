import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { resetR2ObjectMemo, type R2OfferIndex } from './r2OfferSnapshot';
import {
  loadOfferIndex,
  loadOffersForTypes,
  parseOfferIndex,
  resetOfferChunkMemo,
  offerIndexFromR2,
  readSpan,
  type RawOfferIndex,
} from './publicContractOfferIndex';

const getDoc = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDoc,
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const row = (typeId: number, contractId: number) => ({ typeId, contractId });

/** Chunk 0: types 34, 35. Chunk 1: 35, 36. Chunk 2: 37. */
function serve(published: { lastSyncedAt: number }, indexDoc: unknown) {
  const docs = new Map<string, unknown>([
    ['publicContractOffersIndex/types', indexDoc],
    ['publicContractOffers/meta', published],
    [
      'publicContractOffers/chunk-0000',
      { rows: [row(34, 1), row(35, 2)], publishedAt: published.lastSyncedAt },
    ],
    [
      'publicContractOffers/chunk-0001',
      { rows: [row(35, 3), row(36, 4)], publishedAt: published.lastSyncedAt },
    ],
    [
      'publicContractOffers/chunk-0002',
      { rows: [row(37, 5)], publishedAt: published.lastSyncedAt },
    ],
  ]);
  getDoc.mockImplementation(async (ref: { path: string }) => ({ data: () => docs.get(ref.path) }));
}

const INDEX_DOC: RawOfferIndex = {
  lastSyncedAt: 100,
  types: {
    '34': [1, 10, 0, 0],
    '35': [2, 20, 0, 1],
    '36': [1, null, 1, 1],
    '37': [1, 5, 2, 2],
  },
  regionIds: [10000002],
};

function chunkReads(): string[] {
  return getDoc.mock.calls
    .map(([ref]) => (ref as { path: string }).path)
    .filter((path) => path.includes('chunk-'));
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  // R2 unreachable: these tests cover the Firestore path (ADR 0019 fallback).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    })
  );
  resetOfferChunkMemo();
  resetR2ObjectMemo();
  getDoc.mockReset();
});

describe('parseOfferIndex', () => {
  it('turns the written doc into typed entries keyed by numeric id', () => {
    const index = parseOfferIndex(INDEX_DOC);
    expect(index.types.get(35)).toEqual({
      typeId: 35,
      count: 2,
      cheapest: 20,
      firstChunk: 0,
      lastChunk: 1,
    });
    expect(index.regionIds).toEqual([10000002]);
  });
});

describe('loadOfferIndex', () => {
  it('reads the index doc', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);
    const index = await loadOfferIndex(7);
    expect(index?.types.size).toBe(4);
    expect(index?.lastSyncedAt).toBe(100);
  });

  it('is null, not an error, when no index has been published', async () => {
    serve({ lastSyncedAt: 100 }, undefined);
    expect(await loadOfferIndex(7)).toBeNull();
  });

  it('is null when the read is refused', async () => {
    getDoc.mockRejectedValue(new Error('permission-denied'));
    expect(await loadOfferIndex(7)).toBeNull();
  });
});

describe('loadOffersForTypes', () => {
  it('reads only the chunks that hold the type, and keeps only that type', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);

    const rows = await loadOffersForTypes(parseOfferIndex(INDEX_DOC), new Set([36]), 7);

    expect(rows).toEqual([row(36, 4)]);
    expect(chunkReads()).toEqual(['publicContractOffers/chunk-0001']);
  });

  it('spans a type that straddles two chunks', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);

    const rows = await loadOffersForTypes(parseOfferIndex(INDEX_DOC), new Set([35]), 7);

    expect(rows).toEqual([row(35, 2), row(35, 3)]);
  });

  it('does not re-read a chunk it already has this publish cycle', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);
    const index = parseOfferIndex(INDEX_DOC);
    await loadOffersForTypes(index, new Set([36]), 7);
    getDoc.mockClear();
    serve({ lastSyncedAt: 100 }, INDEX_DOC);

    await loadOffersForTypes(index, new Set([35]), 7);

    expect(chunkReads()).toEqual(['publicContractOffers/chunk-0000']);
  });

  it('is null when a chunk belongs to a newer publish than the index describes', async () => {
    // The chunks are already publish 200; the index still describes 100.
    serve({ lastSyncedAt: 200 }, INDEX_DOC);

    expect(await loadOffersForTypes(parseOfferIndex(INDEX_DOC), new Set([34]), 7)).toBeNull();
  });

  it('is null for a chunk with no stamp, which predates the writer that makes an index', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);
    const base = getDoc.getMockImplementation()!;
    getDoc.mockImplementation(async (ref: { path: string }) =>
      ref.path.includes('chunk-0000') ? { data: () => ({ rows: [row(34, 1)] }) } : base(ref)
    );

    expect(await loadOffersForTypes(parseOfferIndex(INDEX_DOC), new Set([34]), 7)).toBeNull();
  });

  it('is null when a chunk read fails', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);
    const base = getDoc.getMockImplementation()!;
    getDoc.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.includes('chunk-0000')) throw new Error('unavailable');
      return base(ref);
    });

    expect(await loadOffersForTypes(parseOfferIndex(INDEX_DOC), new Set([34]), 7)).toBeNull();
  });
});

describe('with R2 (ADR 0019)', () => {
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

  it('prefers the R2 index, without touching Firestore', async () => {
    serveR2({ [`${ORIGIN}/contract-offers/index.json`]: R2_INDEX });

    const index = await loadOfferIndex(7);

    expect(index?.lastSyncedAt).toBe(300);
    expect(index?.types.get(35)).toMatchObject({ count: 2, cheapest: 20 });
    expect(index?.regionIds).toEqual([10000002]);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('reads just the searched type object for a search', async () => {
    const fetchMock = serveR2({ [`${ORIGIN}/${name(34)}`]: [row(34, 1)] });

    const rows = await loadOffersForTypes(offerIndexFromR2(R2_INDEX), new Set([34]), 7);

    expect(rows).toEqual([row(34, 1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('falls back to the Firestore index when R2 is unreachable', async () => {
    serve({ lastSyncedAt: 100 }, INDEX_DOC);

    expect((await loadOfferIndex(7))?.lastSyncedAt).toBe(100);
  });

  it('answers from the full Firestore snapshot, narrowed, when R2 stops answering mid-session', async () => {
    serveR2({});
    getDoc.mockImplementation(async (ref: { path: string }) => ({
      data: () =>
        ref.path === 'publicContractOffers/meta'
          ? { lastSyncedAt: 100, chunkCount: 1 }
          : { rows: [row(34, 1), row(35, 2)], publishedAt: 100 },
    }));

    const rows = await loadOffersForTypes(offerIndexFromR2(R2_INDEX), new Set([34]), 7);

    expect(rows).toEqual([row(34, 1)]);
  });

  it('counts objects, not chunks, as the read span', () => {
    const index = offerIndexFromR2(R2_INDEX);
    expect(readSpan(index, new Set([34, 35, 999]))).toBe(2);
    expect(readSpan(parseOfferIndex(INDEX_DOC), new Set([35]))).toBe(2);
  });
});
