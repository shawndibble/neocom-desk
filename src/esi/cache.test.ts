import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { EsiError } from './client';
import {
  loadPaginatedWithCache,
  loadWithCache,
  loadWithCacheStatus,
  readCached,
  readCachedRows,
  writeCached,
  GLOBAL_CACHE_CHARACTER_ID,
} from './cache';
import { clearCachePurgePending, purgeCharacterCacheOrSuppress } from './cachePurge';

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

    expect(result).toEqual({
      data: 'live-value',
      fetchedAt: expect.any(Date),
      fromCache: false,
      truncated: false,
    });
    const cached = await db.esiCache.get([CHAR_ID, KEY]);
    expect(cached?.value).toBe('live-value');
  });

  it('falls back to the cache when the live call throws', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });

    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toEqual({
      data: 'stale',
      fetchedAt: new Date(1234),
      fromCache: true,
      truncated: false,
    });
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
    expect(result.cached).toEqual({
      data: 'stale',
      fetchedAt: new Date(1234),
      fromCache: true,
      truncated: false,
    });
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

// ---------------------------------------------------------------------------
// Purge-pending suppression: both tiers failed, so the previous owner's rows
// are still on disk and the read path must read as empty (see cachePurge.ts).
// ---------------------------------------------------------------------------

/** Drive cachePurge into tier 3 for real, rather than poking its internals. */
async function suppressViaFailedPurge(characterId: number): Promise<void> {
  const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
    throw new Error('index damaged');
  });
  const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));
  await purgeCharacterCacheOrSuppress(characterId);
  where.mockRestore();
  clear.mockRestore();
}

describe('read path while a cache purge is pending', () => {
  const OTHER_CHAR_ID = 92;

  beforeEach(async () => {
    await db.settings.clear();
    await clearCachePurgePending(CHAR_ID);
    await clearCachePurgePending(OTHER_CHAR_ID);
  });

  it('loadWithCache returns null instead of the undeleted row when the live call fails', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });
    await suppressViaFailedPurge(CHAR_ID);

    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toBeNull();
  });

  it('loadWithCacheStatus reports cached: null while still surfacing needsReauth', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });
    await suppressViaFailedPurge(CHAR_ID);

    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(401, 'token invalid');
    });

    expect(result).toEqual({ cached: null, needsReauth: true });
  });

  it('still serves LIVE data — degradation is live-only, not offline-only', async () => {
    await suppressViaFailedPurge(CHAR_ID);

    const result = await loadWithCache(CHAR_ID, KEY, async () => 'live-value');

    expect(result).toMatchObject({ data: 'live-value', fromCache: false });
  });

  it('readCached returns undefined for the suppressed character', async () => {
    await writeCached(CHAR_ID, KEY, 'stale', 1234);
    await suppressViaFailedPurge(CHAR_ID);

    expect(await readCached(CHAR_ID, KEY)).toBeUndefined();
  });

  it('does not suppress a different character', async () => {
    await db.esiCache.put({ characterId: OTHER_CHAR_ID, key: KEY, value: 'mine', fetchedAt: 1 });
    await suppressViaFailedPurge(CHAR_ID);

    const result = await loadWithCache(OTHER_CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toMatchObject({ data: 'mine', fromCache: true });
  });

  it('does not suppress GLOBAL_CACHE_CHARACTER_ID rows', async () => {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'type:587', 'Tritanium', 1);
    await suppressViaFailedPurge(CHAR_ID);

    expect(await readCached(GLOBAL_CACHE_CHARACTER_ID, 'type:587')).toBe('Tritanium');
  });

  it('serves the cache again once a later purge succeeds and the marker clears', async () => {
    await suppressViaFailedPurge(CHAR_ID);
    await purgeCharacterCacheOrSuppress(CHAR_ID);
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'fresh', fetchedAt: 5 });

    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toMatchObject({ data: 'fresh', fromCache: true });
  });
});

describe('readCachedRows', () => {
  const OTHER = 92;

  beforeEach(async () => {
    await db.settings.clear();
    await clearCachePurgePending(CHAR_ID);
    await clearCachePurgePending(OTHER);
  });

  it('reads one key across many characters, keyed by character', async () => {
    await writeCached(CHAR_ID, KEY, 'a', 1000);
    await writeCached(OTHER, KEY, 'b', 2000);

    const rows = await readCachedRows<string>([CHAR_ID, OTHER], KEY);

    expect(rows.get(CHAR_ID)?.data).toBe('a');
    expect(rows.get(OTHER)?.data).toBe('b');
    expect(rows.get(CHAR_ID)?.fetchedAt).toEqual(new Date(1000));
    expect(rows.get(CHAR_ID)?.fromCache).toBe(true);
  });

  it('omits a character with no row, rather than inventing an empty value', async () => {
    await writeCached(CHAR_ID, KEY, 'a', 1000);

    const rows = await readCachedRows<string>([CHAR_ID, OTHER], KEY);

    expect(rows.has(OTHER)).toBe(false);
  });

  it('returns an empty map for no characters, without touching Dexie', async () => {
    const bulkGet = vi.spyOn(db.esiCache, 'bulkGet');
    expect((await readCachedRows<string>([], KEY)).size).toBe(0);
    expect(bulkGet).not.toHaveBeenCalled();
    bulkGet.mockRestore();
  });

  it('carries the truncated flag through', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: KEY,
      value: [],
      fetchedAt: 1,
      truncated: true,
    });
    const rows = await readCachedRows<unknown[]>([CHAR_ID], KEY);
    expect(rows.get(CHAR_ID)?.truncated).toBe(true);
  });

  it('suppresses a purge-pending character while still serving the others', async () => {
    // The batch read must honour the same gate readCachedRow does, or a
    // previous owner's rows reach a caller that happened to read in bulk.
    await writeCached(CHAR_ID, KEY, 'previous owner', 1000);
    await writeCached(OTHER, KEY, 'mine', 1000);
    await suppressViaFailedPurge(CHAR_ID);

    const rows = await readCachedRows<string>([CHAR_ID, OTHER], KEY);

    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeDefined(); // still on disk
    expect(rows.has(CHAR_ID)).toBe(false); // but never served
    expect(rows.get(OTHER)?.data).toBe('mine');
  });
});

describe('loadPaginatedWithCache', () => {
  it('refuses to let a short fetch overwrite a complete cached list', async () => {
    await db.esiCache.put({ characterId: 7, key: 'k', value: ['a', 'b', 'c'], fetchedAt: 1 });

    const result = await loadPaginatedWithCache(7, 'k', async () => ({
      items: ['a'],
      truncated: true,
    }));

    expect(result?.data).toEqual(['a', 'b', 'c']);
    expect(result?.truncated).toBe(false);
    expect((await db.esiCache.get([7, 'k']))?.value).toEqual(['a', 'b', 'c']);
  });

  it('stores a short fetch when nothing is cached, so the cache cannot stay cold', async () => {
    const result = await loadPaginatedWithCache(7, 'cold', async () => ({
      items: ['a'],
      truncated: true,
    }));

    expect(result?.data).toEqual(['a']);
    expect(result?.truncated).toBe(true);
    expect((await db.esiCache.get([7, 'cold']))?.truncated).toBe(true);
  });

  it('reports truncation on a cache hit: a short list must not look whole after a reload', async () => {
    await db.esiCache.put({
      characterId: 7,
      key: 'k2',
      value: ['a'],
      fetchedAt: 1,
      truncated: true,
    });

    const result = await loadPaginatedWithCache(7, 'k2', async () => {
      throw new Error('offline');
    });

    expect(result?.truncated).toBe(true);
    expect(result?.fromCache).toBe(true);
  });

  it('treats a legacy row with no truncated field as complete', async () => {
    await db.esiCache.put({ characterId: 7, key: 'legacy', value: ['a'], fetchedAt: 1 });

    const result = await loadPaginatedWithCache(7, 'legacy', async () => {
      throw new Error('offline');
    });

    expect(result?.truncated).toBe(false);
  });

  it('lets a complete fetch replace a partial cached list', async () => {
    await db.esiCache.put({
      characterId: 7,
      key: 'k3',
      value: ['a'],
      fetchedAt: 1,
      truncated: true,
    });

    await loadPaginatedWithCache(7, 'k3', async () => ({ items: ['a', 'b'], truncated: false }));

    const row = await db.esiCache.get([7, 'k3']);
    expect(row?.value).toEqual(['a', 'b']);
    expect(row?.truncated).toBe(false);
  });
});
