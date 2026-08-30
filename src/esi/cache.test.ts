import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { EsiError } from './client';
import {
  loadWithCache,
  loadWithCacheStatus,
  readCached,
  writeCached,
  GLOBAL_CACHE_CHARACTER_ID,
} from './cache';

const CHAR_ID = 91;
const KEY = 'thing';

beforeEach(async () => {
  await db.esiCache.clear();
});

describe('GLOBAL_CACHE_CHARACTER_ID', () => {
  it('is the sentinel row 0', () => {
    expect(GLOBAL_CACHE_CHARACTER_ID).toBe(0);
  });
});

describe('loadWithCache', () => {
  it('fetches live, writes the cache, and reports fromCache: false', async () => {
    const result = await loadWithCache(CHAR_ID, KEY, async () => 'live-value');

    expect(result).toEqual({ data: 'live-value', fetchedAt: expect.any(Date), fromCache: false });
    const cached = await db.esiCache.get([CHAR_ID, KEY]);
    expect(cached?.value).toBe('live-value');
  });

  it('falls back to the cache when the live call throws', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });

    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toEqual({ data: 'stale', fetchedAt: new Date(1234), fromCache: true });
  });

  it('returns null when the live call fails and nothing is cached', async () => {
    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });
    expect(result).toBeNull();
  });

  it('falls back to the cache when the live call resolves null (e.g. 304 with no prior fetch)', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1 });
    const result = await loadWithCache(CHAR_ID, KEY, async () => null);
    expect(result?.fromCache).toBe(true);
  });
});

describe('loadWithCacheStatus — default auth-failure detection', () => {
  it('reports needsReauth: true on a 401 EsiError, without discarding cached data', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });

    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(401, 'token invalid');
    });

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toEqual({ data: 'stale', fetchedAt: new Date(1234), fromCache: true });
  });

  it('reports needsReauth: true on a 403 EsiError with null cached when nothing was ever cached', async () => {
    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(403, 'missing scope');
    });

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('still falls back to cache (needsReauth: false) for a non-auth failure', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });

    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(true);
  });

  it('reports live data with needsReauth: false on success', async () => {
    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => 'live-value');
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(false);
  });
});

describe('loadWithCacheStatus — options', () => {
  it('detectAuthFailure overrides the default (industry/jobs.ts: only a 403 counts, not a 401)', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1 });

    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(401, 'token invalid');
      },
      { detectAuthFailure: (err) => err instanceof EsiError && err.status === 403 }
    );

    // A 401 no longer counts as an auth failure under this override, so it's
    // treated as a generic offline-style error: falls back to cache as usual.
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(true);
  });

  it('skipCacheOnAuthFailure returns cached: null on an auth failure even when a cache row exists', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1 });

    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(403, 'missing scope');
      },
      {
        detectAuthFailure: (err) => err instanceof EsiError && err.status === 403,
        skipCacheOnAuthFailure: true,
      }
    );

    expect(result).toEqual({ cached: null, needsReauth: true });
  });
});

describe('readCached / writeCached', () => {
  it('round-trips a value under an explicit fetchedAt (batch callers stamp one timestamp for many rows)', async () => {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'name:42', 'Jita IV', 555);

    expect(await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, 'name:42')).toBe('Jita IV');
    const row = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'name:42']);
    expect(row?.fetchedAt).toBe(555);
  });

  it('readCached returns undefined for a miss', async () => {
    expect(await readCached(CHAR_ID, 'nope')).toBeUndefined();
  });
});
