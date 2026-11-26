import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import {
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  resetRevalidationState,
  settleEsiCacheLoads,
} from './cache';
import { deferred } from '@/test/deferred';

const CHAR_ID = 91;
const KEY = 'settle-thing';

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
});

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

  it('forgets a load that will not settle, so the next one of its key starts its own request', async () => {
    const stuck = deferred<string>();
    const stuckLoad = loadWithCacheStatus(CHAR_ID, KEY, () => stuck.promise);
    await expect(settleEsiCacheLoads(30)).rejects.toThrow(`${CHAR_ID}:${KEY}`);

    const fetchLive = vi.fn(async () => 'fresh');
    const next = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);
    expect(fetchLive).toHaveBeenCalledOnce();
    expect(next.cached?.data).toBe('fresh');
    await settleEsiCacheLoads();

    stuck.resolve('late');
    await stuckLoad;
    await settleEsiCacheLoads();
  });
});
