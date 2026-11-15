import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import {
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  resetRevalidationState,
  settleEsiCacheLoads,
} from './cache';

const CHAR_ID = 91;
const KEY = 'settle-thing';

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('settleEsiCacheLoads', () => {
  it('resolves at once when nothing is loading', async () => {
    await expect(settleEsiCacheLoads()).resolves.toBeUndefined();
  });

  it('resolves only after a slow load has written its row', async () => {
    const live = deferred<string>();
    const fetchLive = vi.fn(() => live.promise);
    const load = loadWithCacheStatus(CHAR_ID, KEY, fetchLive);

    let settled = false;
    const settle = settleEsiCacheLoads().then(() => {
      settled = true;
    });
    // Past its cache reads and out on the network: only the write is left to wait for.
    await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
    expect(settled).toBe(false);

    live.resolve('payload');
    await settle;
    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeDefined();
    await load;
  });

  it('waits for a paginated load too', async () => {
    const live = deferred<{ items: string[]; truncated: boolean }>();
    const load = loadPaginatedWithCacheStatus(CHAR_ID, KEY, () => live.promise);

    live.resolve({ items: ['a'], truncated: false });
    await settleEsiCacheLoads();
    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeDefined();
    await load;
  });

  it('names the pending key when a load will not settle', async () => {
    const live = deferred<string>();
    const load = loadWithCacheStatus(CHAR_ID, KEY, () => live.promise);

    await expect(settleEsiCacheLoads(30)).rejects.toThrow(`${CHAR_ID}:${KEY}`);

    live.resolve('payload');
    await load;
    await settleEsiCacheLoads();
  });
});
