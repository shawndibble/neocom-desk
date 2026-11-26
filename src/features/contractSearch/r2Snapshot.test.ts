import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, resetRevalidationState } from '@/esi/cache';
import { loadR2Snapshot, type R2Snapshot, type R2SnapshotSource } from './r2Snapshot';

const STALE_AFTER_MS = 30 * 60_000;
const CACHE_KEY = 'r2SnapshotTest';

function source(
  read: () => Promise<R2Snapshot<{ id: string }> | null>
): R2SnapshotSource<{ id: string }> {
  return { cacheKey: CACHE_KEY, staleAfterMs: STALE_AFTER_MS, read };
}

async function seedLapsedRow(value: unknown): Promise<void> {
  await db.esiCache.put({
    characterId: GLOBAL_CACHE_CHARACTER_ID,
    key: CACHE_KEY,
    value,
    fetchedAt: Date.now() - STALE_AFTER_MS - 60_000,
  });
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
});

describe('loadR2Snapshot', () => {
  it('renders a lapsed snapshot without waiting for the live read', async () => {
    await seedLapsedRow({ rows: [{ id: 'last-cycle' }], lastSyncedAt: 1 });
    let released!: () => void;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    const read = vi.fn(async () => {
      await gate;
      return { rows: [{ id: 'this-cycle' }], lastSyncedAt: 2 };
    });

    const pending = loadR2Snapshot(source(read));
    const result = await pending;

    expect(result.cached?.data.rows).toEqual([{ id: 'last-cycle' }]);
    expect(result.cached?.fromCache).toBe(false);
    expect(result.revalidating).toBe(true);
    released();
    await vi.waitFor(async () =>
      expect((await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY]))?.value).toMatchObject({
        rows: [{ id: 'this-cycle' }],
      })
    );
  });

  it('blocks on the live read when there is no stored snapshot to show', async () => {
    const result = await loadR2Snapshot(
      source(async () => ({ rows: [{ id: 'cold' }], lastSyncedAt: 3 }))
    );

    expect(result.cached?.data.rows).toEqual([{ id: 'cold' }]);
    expect(result.revalidating).toBe(false);
  });

  it('reads as no snapshot when the live read is unavailable and nothing is cached', async () => {
    const result = await loadR2Snapshot(source(async () => null));

    expect(result.cached).toBeNull();
  });
});
