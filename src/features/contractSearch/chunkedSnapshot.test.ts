/**
 * The read half of the published contract snapshots. These assertions exist
 * because `ContractSearchPanel.test.tsx` mocks `publicContractOffers` and
 * `publicCourierContracts` outright, so nothing there exercises this module or
 * the cache path underneath it — a green panel suite says nothing about
 * whether a lapsed snapshot renders or blocks (issue #963).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, STALE_GRACE_MS, resetRevalidationState } from '@/esi/cache';
import {
  chunkDocId,
  loadChunkedSnapshot,
  useChunkProgressStore,
  type ChunkedSnapshotSource,
} from './chunkedSnapshot';

const getDocs = vi.hoisted(() => vi.fn());
const getDoc = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  getDoc,
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const STALE_AFTER_MS = 30 * 60_000;
const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'publicCourierContracts',
  cacheKey: 'publicCourierContracts',
  staleAfterMs: STALE_AFTER_MS,
};
const CHARACTER_ID = 91;

/** Serves `meta` and each chunk by path, the way Firestore answers per-doc reads. */
function serveDocs(
  lastSyncedAt: number,
  chunks: readonly (readonly unknown[])[],
  withChunkCount = true
): void {
  const data = new Map<string, unknown>([
    [
      'publicCourierContracts/meta',
      withChunkCount ? { lastSyncedAt, chunkCount: chunks.length } : { lastSyncedAt },
    ],
    ...chunks.map((rows, i) => [`publicCourierContracts/${chunkDocId(i)}`, { rows }] as const),
  ]);
  getDoc.mockImplementation(async (ref: { path: string }) => ({ data: () => data.get(ref.path) }));
}

async function seedLapsedRow(value: unknown): Promise<void> {
  await db.esiCache.put({
    characterId: GLOBAL_CACHE_CHARACTER_ID,
    key: SOURCE.cacheKey,
    value,
    fetchedAt: Date.now() - STALE_AFTER_MS - 60_000,
  });
}

/** Real timers: `fake-indexeddb` schedules on the same ones, so faking them deadlocks Dexie. */
async function expireGrace(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, STALE_GRACE_MS + 25));
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  getDocs.mockReset();
  getDoc.mockReset();
  useChunkProgressStore.setState({ byKey: {} });
});

describe('chunkDocId', () => {
  it('matches the id scheme functions/src/publicContracts.ts writes', () => {
    expect(chunkDocId(0)).toBe('chunk-0000');
    expect(chunkDocId(123)).toBe('chunk-0123');
  });
});

describe('loadChunkedSnapshot', () => {
  it('concatenates every chunk doc in order and reads lastSyncedAt off meta', async () => {
    serveDocs(1_700_000_000_000, [[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);

    const result = await loadChunkedSnapshot<{ id: number }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.cached?.data.lastSyncedAt).toBe(1_700_000_000_000);
    expect(result.revalidating).toBe(false);
  });

  it('reports chunks landed against the count meta states, then clears', async () => {
    serveDocs(5, [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]]);
    const seen: Array<{ done: number; total: number | null } | undefined> = [];
    const unsubscribe = useChunkProgressStore.subscribe((state) =>
      seen.push(state.byKey[SOURCE.cacheKey])
    );

    await loadChunkedSnapshot<{ id: number }>(SOURCE, CHARACTER_ID);
    unsubscribe();

    expect(seen[0]).toEqual({ done: 0, total: 3 });
    expect(seen).toContainEqual({ done: 3, total: 3 });
    expect(seen.at(-1)).toBeUndefined();
    expect(useChunkProgressStore.getState().byKey[SOURCE.cacheKey]).toBeUndefined();
  });

  it('re-reads once when a publish lands mid-read', async () => {
    serveDocs(1, [[{ id: 'old' }]]);
    const base = getDoc.getMockImplementation()!;
    let metaReads = 0;
    getDoc.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith('/meta')) {
        metaReads += 1;
        // Second read (the post-check) sees a newer publish; later reads settle.
        if (metaReads === 2) return { data: () => ({ lastSyncedAt: 2, chunkCount: 1 }) };
        if (metaReads >= 3) return { data: () => ({ lastSyncedAt: 2, chunkCount: 1 }) };
      }
      return base(ref);
    });

    const result = await loadChunkedSnapshot<{ id: string }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.lastSyncedAt).toBe(2);
  });

  it('falls back to one whole-collection read when meta has no chunk count', async () => {
    serveDocs(7, [], false);
    getDocs.mockResolvedValue({
      docs: [
        { id: 'meta', data: () => ({ lastSyncedAt: 7 }) },
        { id: 'chunk-0000', data: () => ({ rows: [{ id: 'legacy' }] }) },
      ],
    });

    const result = await loadChunkedSnapshot<{ id: string }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.rows).toEqual([{ id: 'legacy' }]);
  });

  it('renders a lapsed snapshot without waiting for the chunk reads', async () => {
    await seedLapsedRow({ rows: [{ id: 'last-cycle' }], lastSyncedAt: 1 });
    let released!: () => void;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    getDoc.mockImplementation(async (ref: { path: string }) => {
      await gate;
      return {
        data: () =>
          ref.path.endsWith('/meta')
            ? { lastSyncedAt: 2, chunkCount: 1 }
            : { rows: [{ id: 'this-cycle' }] },
      };
    });

    const pending = loadChunkedSnapshot<{ id: string }>(SOURCE, CHARACTER_ID);
    await expireGrace();
    const result = await pending;

    // Settled while the 124-doc read is still in flight — the whole point.
    expect(result.cached?.data.rows).toEqual([{ id: 'last-cycle' }]);
    // Nothing has failed yet, so no view raises its offline banner.
    expect(result.cached?.fromCache).toBe(false);
    // But the board must be able to say a newer read is on its way.
    expect(result.revalidating).toBe(true);
    released();
  });

  it('still blocks when there is no stored snapshot to show', async () => {
    serveDocs(3, [[{ id: 'cold' }]]);

    const result = await loadChunkedSnapshot<{ id: string }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.rows).toEqual([{ id: 'cold' }]);
    expect(result.revalidating).toBe(false);
  });
});
