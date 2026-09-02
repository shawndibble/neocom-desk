import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { EsiError } from './client';
import {
  invalidateFreshness,
  onCacheRevalidated,
  resetRevalidationState,
  REFRESH_BYPASS_MS,
  STALE_AFTER,
  STALE_GRACE_MS,
  loadPaginatedWithCache,
  loadPaginatedWithCacheStatus,
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
  // Module state, not Dexie state: without this one test's failed revalidation
  // for [91, 'thing'] silently suppresses the next test's fetch for the same key.
  resetRevalidationState();
});

/**
 * Every assertion in this file below this point exercises the *fast* path: a
 * live call that settles well inside `STALE_GRACE_MS` keeps the single-phase
 * contract it always had, including `needsReauth` and `skipCacheOnAuthFailure`.
 * That is the point of racing rather than serving stale unconditionally — see
 * the "grace period" block at the end for the slow path.
 */

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

// ---------------------------------------------------------------------------
// In-flight dedupe: concurrent identical reads share one fetchLive call
// rather than racing (issue #41).
// ---------------------------------------------------------------------------

describe('in-flight dedupe', () => {
  it('loadWithCacheStatus: two concurrent calls for the same key share one fetchLive call', async () => {
    let calls = 0;
    const fetchLive = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return 'live-value';
    });

    const [a, b] = await Promise.all([
      loadWithCacheStatus(CHAR_ID, KEY, fetchLive),
      loadWithCacheStatus(CHAR_ID, KEY, fetchLive),
    ]);

    expect(calls).toBe(1);
    expect(a.cached?.data).toBe('live-value');
    expect(b.cached?.data).toBe('live-value');
    expect(a).toEqual(b);
  });

  it('a call after the in-flight one settles gets its own fresh fetchLive call', async () => {
    const fetchLive = vi.fn(async () => 'live-value');

    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);
    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it('a rejection does not poison the dedupe entry for the next call', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    await loadWithCacheStatus(CHAR_ID, KEY, failing);

    const succeeding = vi.fn(async () => 'live-value');
    const result = await loadWithCacheStatus(CHAR_ID, KEY, succeeding);

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result.cached?.data).toBe('live-value');
  });

  it('does not dedupe across different keys or characters', async () => {
    const fetchA = vi.fn(async () => 'a');
    const fetchB = vi.fn(async () => 'b');

    await Promise.all([
      loadWithCacheStatus(CHAR_ID, 'key-a', fetchA),
      loadWithCacheStatus(CHAR_ID, 'key-b', fetchB),
    ]);

    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('loadPaginatedWithCacheStatus: two concurrent calls for the same key share one fetchLive call', async () => {
    const fetchLive = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { items: ['a', 'b'], truncated: false };
    });

    const [a, b] = await Promise.all([
      loadPaginatedWithCacheStatus(CHAR_ID, KEY, fetchLive),
      loadPaginatedWithCacheStatus(CHAR_ID, KEY, fetchLive),
    ]);

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(a.cached?.data).toEqual(['a', 'b']);
    expect(b.cached?.data).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Freshness window: a repeated read inside the window ESI's own Expires
// header declared is served from the Dexie row without a network call
// (issue #41). Driven by `expiresCapture`, written by fetchLive itself so
// the window reflects that specific response rather than a guessed constant.
// ---------------------------------------------------------------------------

describe('freshness window', () => {
  beforeEach(async () => {
    // freshnessInvalidatedAt is module state shared across the whole file; a
    // prior test's real-clock invalidateFreshness() call would otherwise
    // outrank every mocked (small) timestamp used below. Pin it to 0 first.
    vi.spyOn(Date, 'now').mockReturnValue(0);
    invalidateFreshness();
    await clearCachePurgePending(CHAR_ID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a second read inside the window is served from the row without calling fetchLive again', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
      capture.value = new Date(1_000_000 + 60_000).toUTCString();
      return 'live-value';
    });
    const capture = { value: null as string | null };

    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    vi.spyOn(Date, 'now').mockReturnValue(1_010_000); // 10s later, still inside the 60s window
    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.cached).toEqual({
      data: 'live-value',
      fetchedAt: new Date(1_000_000),
      fromCache: false,
      truncated: false,
    });
    expect(result.needsReauth).toBe(false);
  });

  it('a read after the window calls fetchLive again', async () => {
    const capture = { value: null as string | null };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
      // An hour, so the Expires header rather than the TTL floor is what this
      // test is stepping past.
      capture.value = new Date(1_000_000 + 3_600_000).toUTCString();
      return 'live-value';
    });

    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 3_700_000);
    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it('a call with no expiresCapture still gets the default window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => 'live-value');

    await loadWithCache(CHAR_ID, KEY, fetchLive);
    await loadWithCache(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('the default window expires after STALE_AFTER.default', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => 'live-value');

    await loadWithCache(CHAR_ID, KEY, fetchLive);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + STALE_AFTER.default + 1);
    await loadWithCache(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it('staleAfterMs overrides the default, for immutable game data', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => 'live-value');
    const options = { staleAfterMs: STALE_AFTER.static };

    await loadWithCache(CHAR_ID, KEY, fetchLive, options);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + STALE_AFTER.default + 1);
    await loadWithCache(CHAR_ID, KEY, fetchLive, options);

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('a longer Expires header wins over the TTL, never shortens it', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const capture = { value: null as string | null };
    const fetchLive = vi.fn(async () => {
      // ESI declares an hour — longer than the 10-minute default floor.
      capture.value = new Date(1_000_000 + 3_600_000).toUTCString();
      return 'live-value';
    });

    await loadWithCache(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + STALE_AFTER.default + 1);
    await loadWithCache(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('a shorter Expires header does not shorten the TTL floor', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const capture = { value: null as string | null };
    const fetchLive = vi.fn(async () => {
      // ESI's own 60s cache; the floor is what the user asked for instead.
      capture.value = new Date(1_000_000 + 60_000).toUTCString();
      return 'live-value';
    });

    await loadWithCache(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000);
    await loadWithCache(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('a manual refresh bypasses the window only for the moments it is running', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => 'live-value');

    // The refreshing route reloads its own key: bypassed, as intended.
    await loadWithCache(CHAR_ID, KEY, fetchLive);
    invalidateFreshness();
    await loadWithCache(CHAR_ID, KEY, fetchLive);
    expect(fetchLive).toHaveBeenCalledTimes(2);

    // Another route's key, navigated to well after that refresh settled: its
    // own window still holds. A global bypass would have refetched everything.
    const other = vi.fn(async () => 'other-value');
    await loadWithCache(CHAR_ID, 'other-key', other);
    invalidateFreshness();
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + REFRESH_BYPASS_MS + 1);
    await loadWithCache(CHAR_ID, 'other-key', other);

    expect(other).toHaveBeenCalledTimes(1);
  });

  it('a manual refresh does not re-read game constants', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => 'Jita IV - Moon 4');
    const options = { staleAfterMs: STALE_AFTER.static };

    // Assets resolves one of these per distinct location; a Refresh click that
    // refetched them all would turn one click into a fan-out over map data.
    await loadWithCache(CHAR_ID, KEY, fetchLive, options);
    invalidateFreshness();
    await loadWithCache(CHAR_ID, KEY, fetchLive, options);

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('invalidateFreshness makes the very next call bypass an active window (manual refresh)', async () => {
    const capture = { value: null as string | null };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
      capture.value = new Date(1_000_000 + 60_000).toUTCString();
      return 'live-value';
    });

    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });
    invalidateFreshness();
    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it('a freshness hit is still suppressed while a purge is pending for that character', async () => {
    await clearCachePurgePending(CHAR_ID);
    const capture = { value: null as string | null };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
      capture.value = new Date(1_000_000 + 60_000).toUTCString();
      return 'live-value';
    });

    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });
    await suppressViaFailedPurge(CHAR_ID);
    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    // Suppressed, so the window can't be read back — falls through to fetchLive,
    // which itself fails to write (purge suppression only gates reads), so this
    // just proves the stale row wasn't silently served.
    expect(fetchLive).toHaveBeenCalledTimes(2);
    expect(result.cached?.data).toBe('live-value');
  });

  it('loadPaginatedWithCacheStatus also honors expiresCapture (not just the singular path)', async () => {
    const capture = { value: null as string | null };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
      capture.value = new Date(1_000_000 + 60_000).toUTCString();
      return { items: ['a', 'b'], truncated: false };
    });

    await loadPaginatedWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });
    vi.spyOn(Date, 'now').mockReturnValue(1_010_000);
    const result = await loadPaginatedWithCacheStatus(CHAR_ID, KEY, fetchLive, {
      expiresCapture: capture,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.cached?.data).toEqual(['a', 'b']);
    expect(result.cached?.fromCache).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Grace period: past the window, a live call that dawdles does not hold the
// view hostage — the stored row is shown and the call finishes behind it.
// Ordering assertions, so `fetchLive` is driven off a promise the test settles
// by hand; a mocked clock alone would pass an implementation that never
// returned early at all.
// ---------------------------------------------------------------------------

describe('grace period past the freshness window', () => {
  /** A `fetchLive` the test decides when, and whether, to settle. */
  function deferredFetch<T>(value: T, failWith: unknown = new Error('offline')) {
    let settle!: (ok: boolean) => void;
    const gate = new Promise<void>((resolve, reject) => {
      settle = (ok) => (ok ? resolve() : reject(failWith));
    });
    const fetchLive = vi.fn(async () => {
      await gate;
      return value;
    });
    return { fetchLive, settle };
  }

  /** Resolves the next time a late live call reports back. */
  function nextRevalidation(): Promise<void> {
    return new Promise((resolve) => {
      const off = onCacheRevalidated(() => {
        off();
        resolve();
      });
    });
  }

  async function seedStaleRow(value: unknown): Promise<void> {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: KEY,
      value,
      fetchedAt: Date.now() - STALE_AFTER.default - 60_000,
    });
  }

  /**
   * Waits out the real grace timer.
   *
   * Deliberately not `vi.useFakeTimers()`: `fake-indexeddb` schedules its own
   * work on the same timers, so faking them deadlocks every Dexie read in this
   * block — including the one `loadPastWindow` makes *after* the grace expires.
   * A real quarter second per test is the cheaper price.
   */
  async function expireGrace(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, STALE_GRACE_MS + 25));
  }

  beforeEach(async () => {
    await clearCachePurgePending(CHAR_ID);
    // `freshnessInvalidatedAt` is module state with a 30s reach, so the manual
    // refresh test below would otherwise keep every later test's row from
    // being substituted. Pinning it to 0 puts it far outside REFRESH_BYPASS_MS.
    vi.spyOn(Date, 'now').mockReturnValue(0);
    invalidateFreshness();
    vi.restoreAllMocks();
  });

  it('shows the stored row once the grace period passes, without waiting for the call', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('fresh');

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await expireGrace();
    const result = await pending;

    // Resolved while fetchLive is still pending — the point of the whole thing.
    expect(result.cached?.data).toBe('two-days-old');
    // No bad news yet, so no view raises its offline banner.
    expect(result.cached?.fromCache).toBe(false);
    settle(true);
  });

  it('waits for a call that answers inside the grace period, and shows fresh data', async () => {
    await seedStaleRow('two-days-old');

    const result = await loadWithCacheStatus<string>(CHAR_ID, KEY, async () => 'fresh');

    expect(result.cached?.data).toBe('fresh');
    expect(result.cached?.fromCache).toBe(false);
  });

  it('writes the late result and signals, so a mounted view can silently re-read it', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('fresh');
    const signalled = nextRevalidation();

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await expireGrace();
    await pending;

    settle(true);
    await signalled;

    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    expect(reread.cached?.data).toBe('fresh');
    expect(reread.cached?.fromCache).toBe(false);
  });

  it('a late failure signals too, and the re-read raises the offline banner', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('never-arrives');
    const signalled = nextRevalidation();

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await expireGrace();
    expect((await pending).cached?.fromCache).toBe(false);

    settle(false);
    await signalled;

    // The bad news the optimistic read had none of.
    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    expect(reread.cached?.data).toBe('two-days-old');
    expect(reread.cached?.fromCache).toBe(true);
    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('does not start another slow call after a late failure, so the signal cannot loop', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('never-arrives');
    const signalled = nextRevalidation();

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await expireGrace();
    await pending;
    settle(false);
    await signalled;

    await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('still withholds the row from a caller that opted out of stale-on-auth-failure', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch(
      'never-arrives',
      new EsiError(403, 'missing scope')
    );
    const options = {
      detectAuthFailure: (err: unknown) => err instanceof EsiError && err.status === 403,
      skipCacheOnAuthFailure: true,
    };
    const signalled = nextRevalidation();

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive, options);
    await expireGrace();
    await pending;

    settle(false);
    await signalled;

    // industry jobs / PI: a revoked scope must not leave a row on screen the
    // character may no longer be entitled to.
    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive, options);
    expect(reread.cached).toBeNull();
  });

  it('never substitutes a stored row for a manual refresh', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('fresh');
    invalidateFreshness();

    let resolved = false;
    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive).then((r) => {
      resolved = true;
      return r;
    });
    await expireGrace();
    // The user clicked Refresh and is watching the button: it must report what
    // actually happened, not hand back the row it already had.
    expect(resolved).toBe(false);

    settle(true);
    expect((await pending).cached?.data).toBe('fresh');
  });

  it('never substitutes a stored row for game constants', async () => {
    const stationKey = 'station:60003760';
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: stationKey,
      value: 'Jita IV - Moon 4',
      fetchedAt: Date.now() - STALE_AFTER.static - 60_000,
    });
    const { fetchLive, settle } = deferredFetch('Jita IV - Moon 4');

    let resolved = false;
    const pending = loadWithCacheStatus<string>(GLOBAL_CACHE_CHARACTER_ID, stationKey, fetchLive, {
      staleAfterMs: STALE_AFTER.static,
    }).then((r) => {
      resolved = true;
      return r;
    });
    await expireGrace();
    expect(resolved).toBe(false);

    settle(true);
    await pending;
  });

  it('applies to the paginated path too, not just the singular one', async () => {
    await seedStaleRow(['a', 'b']);
    let settle!: () => void;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const fetchLive = vi.fn(async () => {
      await gate;
      return { items: ['a', 'b', 'c'], truncated: false };
    });

    const pending = loadPaginatedWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await expireGrace();
    const result = await pending;

    expect(result.cached?.data).toEqual(['a', 'b']);
    expect(result.cached?.fromCache).toBe(false);
    settle();
  });
});
