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
import { loadChunkedSnapshot, type ChunkedSnapshotSource } from './chunkedSnapshot';

const getDocs = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  collection: (_db: unknown, name: string) => ({ name }),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const STALE_AFTER_MS = 30 * 60_000;
const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'publicCourierContracts',
  cacheKey: 'publicCourierContracts',
  staleAfterMs: STALE_AFTER_MS,
};
const CHARACTER_ID = 91;

/** One `meta` doc plus N chunk docs, the layout `writeChunkedSnapshot` emits. */
function snapshotDocs(lastSyncedAt: number, chunks: readonly (readonly unknown[])[]) {
  return {
    docs: [
      { id: 'meta', data: () => ({ lastSyncedAt }) },
      ...chunks.map((rows, i) => ({
        id: `chunk-${String(i).padStart(4, '0')}`,
        data: () => ({ rows }),
      })),
    ],
  };
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
});

describe('loadChunkedSnapshot', () => {
  it('concatenates every chunk doc and reads lastSyncedAt off meta', async () => {
    getDocs.mockResolvedValue(
      snapshotDocs(1_700_000_000_000, [[{ id: 1 }, { id: 2 }], [{ id: 3 }]])
    );

    const result = await loadChunkedSnapshot<{ id: number }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.cached?.data.lastSyncedAt).toBe(1_700_000_000_000);
    expect(result.revalidating).toBe(false);
  });

  it('renders a lapsed snapshot without waiting for the collection read', async () => {
    await seedLapsedRow({ rows: [{ id: 'last-cycle' }], lastSyncedAt: 1 });
    let released!: () => void;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    getDocs.mockImplementation(async () => {
      await gate;
      return snapshotDocs(2, [[{ id: 'this-cycle' }]]);
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
    getDocs.mockResolvedValue(snapshotDocs(3, [[{ id: 'cold' }]]));

    const result = await loadChunkedSnapshot<{ id: string }>(SOURCE, CHARACTER_ID);

    expect(result.cached?.data.rows).toEqual([{ id: 'cold' }]);
    expect(result.revalidating).toBe(false);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});
