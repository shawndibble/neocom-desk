import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import {
  invalidateFreshness,
  loadPaginatedWithCache,
  loadWithCache,
  resetRevalidationState,
  cacheKeyFamily,
  corpCacheKey,
  STALE_AFTER,
} from './cache';
import { clearCachePurgePending } from './cachePurge';
import { onCacheMiss, type CacheMiss } from './cacheMissSignal';

const CHAR_ID = 91;
const KEY = 'market-history:10000002:34';

let misses: CacheMiss[];
let ended: number;
let unsubscribe: () => void;

beforeEach(async () => {
  await db.esiCache.clear();
  await db.esiCacheMeta.clear();
  resetRevalidationState();
  // `freshnessInvalidatedAt` is module state; pin it to 0 so an earlier
  // real-clock `invalidateFreshness()` cannot outrank the mocked clock.
  vi.spyOn(Date, 'now').mockReturnValue(0);
  invalidateFreshness();
  await clearCachePurgePending(CHAR_ID);
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  misses = [];
  ended = 0;
  unsubscribe = onCacheMiss((miss) => {
    misses.push(miss);
    return () => {
      ended += 1;
    };
  });
});

afterEach(() => {
  unsubscribe();
  vi.restoreAllMocks();
});

describe('cache-miss signal', () => {
  it('reports a key with nothing stored as cold, and ends it once the live call settles', async () => {
    await loadWithCache(CHAR_ID, KEY, async () => 'live');

    expect(misses).toEqual([{ family: 'market-history', reason: 'cold', global: false }]);
    expect(ended).toBe(1);
  });

  it('reports a stored row past its window as expired', async () => {
    await loadWithCache(CHAR_ID, KEY, async () => 'first');
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + STALE_AFTER.default + 1);
    misses = [];

    await loadWithCache(CHAR_ID, KEY, async () => 'second');

    expect(misses).toEqual([{ family: 'market-history', reason: 'expired', global: false }]);
  });

  it('reports a manual Refresh forcing a fresh row live as refresh', async () => {
    await loadWithCache(CHAR_ID, KEY, async () => 'first');
    invalidateFreshness();
    misses = [];

    await loadWithCache(CHAR_ID, KEY, async () => 'second');

    expect(misses).toEqual([{ family: 'market-history', reason: 'refresh', global: false }]);
  });

  it('reports nothing for a read served inside the window', async () => {
    await loadWithCache(CHAR_ID, KEY, async () => 'first');
    misses = [];

    await loadWithCache(CHAR_ID, KEY, async () => 'second');

    expect(misses).toEqual([]);
  });

  it('reports one miss for concurrent loads of the same key', async () => {
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => (release = resolve));
    const first = loadWithCache(CHAR_ID, KEY, () => gate);
    const second = loadWithCache(CHAR_ID, KEY, () => gate);
    // Both reads must be past their Dexie lookups before the call settles.
    await vi.waitFor(() => expect(misses).toHaveLength(1));
    release('live');
    await Promise.all([first, second]);

    expect(misses).toHaveLength(1);
    expect(ended).toBe(1);
  });

  it('ends the miss when the live call fails too', async () => {
    await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(misses).toHaveLength(1);
    expect(ended).toBe(1);
  });

  it('marks a key under the global row as global', async () => {
    await loadWithCache(0, 'planet-info:40142007', async () => 'planet');

    expect(misses).toEqual([{ family: 'planet-info', reason: 'cold', global: true }]);
  });

  it('covers the paginated read-through as well', async () => {
    await loadPaginatedWithCache(CHAR_ID, 'wallet-journal', async () => ({
      items: [1],
      truncated: false,
    }));

    expect(misses).toEqual([{ family: 'wallet-journal', reason: 'cold', global: false }]);
  });

  it('a throwing listener does not fail the load', async () => {
    const off = onCacheMiss(() => {
      throw new Error('listener bug');
    });
    try {
      await expect(loadWithCache(CHAR_ID, KEY, async () => 'live')).resolves.toMatchObject({
        data: 'live',
      });
    } finally {
      off();
    }
  });
});

describe('cacheKeyFamily', () => {
  it('keeps the part before the first colon', () => {
    expect(cacheKeyFamily('market-history:10000002:34')).toBe('market-history');
    expect(cacheKeyFamily('skills')).toBe('skills');
  });

  it('drops the corporation id from a corp key', () => {
    expect(cacheKeyFamily(corpCacheKey(98000001, 'wallet:1'))).toBe('corp:wallet');
  });

  it('masks any id left in the family itself', () => {
    expect(cacheKeyFamily('contract-items-123456')).toBe('contract-items-*');
  });
});
