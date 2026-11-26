import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { AuthError } from '@/auth/sso';
import { EsiError, EsiOfflineError, EsiTimeoutError, REQUEST_TIMEOUT_MS } from './client';
import {
  invalidateFreshness,
  onCacheRevalidated,
  resetRevalidationState,
  clearRevalidationFailures,
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
  writeCachedMany,
  GLOBAL_CACHE_CHARACTER_ID,
  CORP_CACHE_KEY_PREFIX,
  corpCacheKey,
  cachedKeySet,
} from './cache';
import { clearCachePurgePending, purgeCharacterCacheOrSuppress } from './cachePurge';
import { onEsiAuthFailure, onEsiRoleRefusal } from './authFailureSignal';
import { resetEsiBudget } from './budget';
import { configureActiveCharacter, currentEsiLane, inBackgroundLane } from './lane';
import type { PriorityTicket } from '@/lib/concurrency';

const CHAR_ID = 91;
const KEY = 'thing';

beforeEach(async () => {
  await db.esiCache.clear();
  await db.tokens.clear();
  resetRevalidationState();
});

describe('GLOBAL_CACHE_CHARACTER_ID', () => {
  it('is the sentinel row 0', () => {
    expect(GLOBAL_CACHE_CHARACTER_ID).toBe(0);
  });
});

describe('cachedKeySet', () => {
  it('names the keys that have a row, whatever their age, for this character only', async () => {
    await writeCached(CHAR_ID, 'a', 1, 1);
    await writeCached(CHAR_ID, 'b', 2, Date.now());
    await writeCached(CHAR_ID + 1, 'c', 3, Date.now());

    expect(await cachedKeySet(CHAR_ID, ['a', 'b', 'c', 'd'])).toEqual(new Set(['a', 'b']));
    expect(await cachedKeySet(CHAR_ID, [])).toEqual(new Set());
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

describe('loadWithCacheStatus — shell auth-failure signal (issue #1521)', () => {
  it('does not emit the shell auth-failure signal for a scope the stored grant never claimed', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 100_000,
      scopes: ['esi-skills.read_skills.v1'],
    });
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(403, 'missing scope', undefined, 'getCharacterClones');
    });
    unsubscribe();

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('still emits the shell auth-failure signal when the stored grant does claim the scope (a genuine revoke)', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 100_000,
      scopes: ['esi-clones.read_clones.v1'],
    });
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(403, 'missing scope', undefined, 'getCharacterClones');
    });
    unsubscribe();

    expect(onFailure).toHaveBeenCalledWith(CHAR_ID);
  });

  it('reports a 403 naming a missing corp role as that, never as a re-login', async () => {
    const onFailure = vi.fn();
    const onRole = vi.fn();
    const offFailure = onEsiAuthFailure(onFailure);
    const offRole = onEsiRoleRefusal(onRole);

    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(
          403,
          'Character does not have required role(s)',
          undefined,
          'getCorporationWallets'
        );
      },
      { authFailureEndpoint: 'getCorporationWallets' }
    );
    offFailure();
    offRole();

    expect(result.needsReauth).toBe(false);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onRole).toHaveBeenCalledWith(CHAR_ID, 'getCorporationWallets');
  });

  it('names the endpoint in the signal when the caller says which read it is', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 100_000,
      scopes: ['esi-clones.read_clones.v1'],
    });
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(403, 'missing scope', undefined, 'getCharacterClones');
      },
      { authFailureEndpoint: 'getCharacterClones' }
    );
    unsubscribe();

    expect(onFailure).toHaveBeenCalledWith(CHAR_ID, 'getCharacterClones');
  });

  it.each([
    ['network_error', new AuthError('network_error', 'offline', 0)],
    ['timeout', new AuthError('timeout', 'slow', 0)],
    ['EsiOfflineError', new EsiOfflineError()],
  ])(
    'serves the stored row and stays quiet when the token refresh failed with %s (offline is not an auth failure)',
    async (_name, failure) => {
      await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });
      const onFailure = vi.fn();
      const unsubscribe = onEsiAuthFailure(onFailure);

      const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
        throw failure;
      });
      unsubscribe();

      expect(result.needsReauth).toBe(false);
      expect(result.cached).toMatchObject({ data: 'stale', fromCache: true });
      expect(onFailure).not.toHaveBeenCalled();
    }
  );

  it('does the same on the paginated path', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: ['row'], fetchedAt: 1234 });
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    const result = await loadPaginatedWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new AuthError('network_error', 'offline', 0);
    });
    unsubscribe();

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toMatchObject({ data: ['row'], fromCache: true });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('keeps the cached row for a skipCacheOnAuthFailure loader that only counts a 403', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });

    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new AuthError('network_error', 'offline', 0);
      },
      {
        detectAuthFailure: (err) => err instanceof EsiError && err.status === 403,
        skipCacheOnAuthFailure: true,
      }
    );

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toMatchObject({ data: 'stale', fromCache: true });
  });

  it('still emits for a refresh failure (AuthError), which has no single endpoint to check', async () => {
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new AuthError('invalid_grant', 'refresh failed', 400);
    });
    unsubscribe();

    expect(onFailure).toHaveBeenCalledWith(CHAR_ID);
  });

  it('does not emit for a paginated endpoint 403 when the stored grant never claimed its scope', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 100_000,
      scopes: ['esi-skills.read_skills.v1'],
    });
    const onFailure = vi.fn();
    const unsubscribe = onEsiAuthFailure(onFailure);

    await loadPaginatedWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(403, 'missing scope', undefined, 'getCharacterAssets');
    });
    unsubscribe();

    expect(onFailure).not.toHaveBeenCalled();
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

  it('writeCachedMany stores every row in one bulkPut, in the exact shape writeCached does', async () => {
    const bulkPut = vi.spyOn(db.esiCache, 'bulkPut');
    const put = vi.spyOn(db.esiCache, 'put');

    await writeCachedMany(
      GLOBAL_CACHE_CHARACTER_ID,
      [
        ['name:1', 'Alpha'],
        ['name:2', { nested: true }],
      ],
      777
    );
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'name:3', 'Gamma', 777);

    expect(bulkPut).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    const viaMany = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'name:1']);
    const viaOne = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'name:3']);
    expect(Object.keys(viaMany ?? {}).sort()).toEqual(Object.keys(viaOne ?? {}).sort());
    expect(viaMany).toEqual({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: 'name:1',
      value: 'Alpha',
      fetchedAt: 777,
    });
    expect(await readCached(GLOBAL_CACHE_CHARACTER_ID, 'name:2')).toEqual({ nested: true });
    bulkPut.mockRestore();
    put.mockRestore();
  });

  it('writeCachedMany with no rows touches nothing', async () => {
    const bulkPut = vi.spyOn(db.esiCache, 'bulkPut');

    await writeCachedMany(CHAR_ID, [], 1);

    expect(bulkPut).not.toHaveBeenCalled();
    bulkPut.mockRestore();
  });
});

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
    await writeCached(CHAR_ID, KEY, 'previous owner', 1000);
    await writeCached(OTHER, KEY, 'mine', 1000);
    await suppressViaFailedPurge(CHAR_ID);

    const rows = await readCachedRows<string>([CHAR_ID, OTHER], KEY);

    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeDefined();
    expect(rows.has(CHAR_ID)).toBe(false);
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

describe('ESI priority lanes', () => {
  afterEach(() => resetEsiBudget());

  function heldFetch<R>(value: R) {
    const seen: { lane: PriorityTicket | undefined } = { lane: undefined };
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fetchLive = vi.fn(async () => {
      seen.lane = currentEsiLane();
      await done;
      return value;
    });
    return { seen, fetchLive, finish };
  }

  it('runs a background load’s live call in a low lane, past the cache’s own awaits', async () => {
    const { seen, fetchLive, finish } = heldFetch('v');
    const load = inBackgroundLane(() => loadWithCacheStatus(CHAR_ID, KEY, fetchLive));
    await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
    finish();
    await load;
    expect(seen.lane?.priority).toBe('low');
  });

  it('runs a foreground load’s live call in no lane at all', async () => {
    const { seen, fetchLive, finish } = heldFetch('v');
    const load = loadWithCacheStatus(CHAR_ID, KEY, fetchLive);
    await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
    finish();
    await load;
    expect(seen.lane).toBeUndefined();
  });

  it('promotes an in-flight background load when a foreground caller joins it', async () => {
    const { seen, fetchLive, finish } = heldFetch('v');
    const background = inBackgroundLane(() => loadWithCacheStatus(CHAR_ID, KEY, fetchLive));
    await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
    expect(seen.lane?.priority).toBe('low');

    const foreground = loadWithCacheStatus(
      CHAR_ID,
      KEY,
      vi.fn(async () => 'other')
    );
    await vi.waitFor(() => expect(seen.lane?.priority).toBe('normal'));
    finish();
    const [a, b] = await Promise.all([background, foreground]);
    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('leaves an in-flight background load low when another background caller joins it', async () => {
    const charId = 2271;
    const { seen, fetchLive, finish } = heldFetch('v');
    const rowReads = vi.spyOn(db.esiCache, 'get');
    try {
      const first = inBackgroundLane(() => loadWithCacheStatus(charId, KEY, fetchLive));
      await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
      const readsBefore = rowReads.mock.calls.length;
      const second = inBackgroundLane(() => loadWithCacheStatus(charId, KEY, fetchLive));
      await vi.waitFor(() => expect(rowReads.mock.calls.length).toBeGreaterThan(readsBefore));
      await rowReads.mock.results[readsBefore].value;
      // eslint-disable-next-line no-restricted-syntax -- asserts no promotion: nothing to wait on but the microtask-only join, which one macrotask drains
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(seen.lane?.priority).toBe('low');
      finish();
      const [a, b] = await Promise.all([first, second]);
      expect(fetchLive).toHaveBeenCalledTimes(1);
      expect(b).toBe(a);
    } finally {
      finish();
      rowReads.mockRestore();
    }
  });

  it('promotes an in-flight paginated background load when a foreground caller joins it', async () => {
    const { seen, fetchLive, finish } = heldFetch({ items: ['a'], truncated: false });
    const background = inBackgroundLane(() =>
      loadPaginatedWithCacheStatus(CHAR_ID, KEY, fetchLive)
    );
    await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
    expect(seen.lane?.priority).toBe('low');

    const foreground = loadPaginatedWithCacheStatus(
      CHAR_ID,
      KEY,
      vi.fn(async () => ({ items: ['b'], truncated: false }))
    );
    await vi.waitFor(() => expect(seen.lane?.priority).toBe('normal'));
    finish();
    await Promise.all([background, foreground]);
  });

  it('promotes a background load for the active Character straight to high when a view joins it (issue #2281)', async () => {
    configureActiveCharacter(() => CHAR_ID);
    try {
      const { seen, fetchLive, finish } = heldFetch('v');
      const background = inBackgroundLane(() => loadWithCacheStatus(CHAR_ID, KEY, fetchLive));
      await vi.waitFor(() => expect(fetchLive).toHaveBeenCalled());
      expect(seen.lane?.priority).toBe('low');

      const foreground = loadWithCacheStatus(
        CHAR_ID,
        KEY,
        vi.fn(async () => 'other')
      );
      await vi.waitFor(() => expect(seen.lane?.priority).toBe('high'));
      finish();
      await Promise.all([background, foreground]);
    } finally {
      configureActiveCharacter(null);
    }
  });
});

describe('freshness window', () => {
  beforeEach(async () => {
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

    vi.spyOn(Date, 'now').mockReturnValue(1_010_000);
    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { expiresCapture: capture });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.cached).toEqual({
      data: 'live-value',
      fetchedAt: new Date(1_000_000),
      expiresAt: new Date(1_060_000),
      fromCache: false,
      truncated: false,
    });
    expect(result.needsReauth).toBe(false);
  });

  it('a read after the window calls fetchLive again', async () => {
    const capture = { value: null as string | null };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchLive = vi.fn(async () => {
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

    await loadWithCache(CHAR_ID, KEY, fetchLive);
    invalidateFreshness();
    await loadWithCache(CHAR_ID, KEY, fetchLive);
    expect(fetchLive).toHaveBeenCalledTimes(2);

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

describe('grace period past the freshness window', () => {
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

  async function expireGrace(): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- the real grace timer; fake timers deadlock fake-indexeddb
    await new Promise((resolve) => setTimeout(resolve, STALE_GRACE_MS + 25));
  }

  beforeEach(async () => {
    await clearCachePurgePending(CHAR_ID);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    invalidateFreshness();
    vi.restoreAllMocks();
  });

  it('shows the stored row once the grace period passes, without waiting for the call', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('fresh');

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    const result = await pending;

    expect(result.cached?.data).toBe('two-days-old');
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
    expect((await pending).cached?.fromCache).toBe(false);

    settle(false);
    await signalled;

    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    expect(reread.cached?.data).toBe('two-days-old');
    expect(reread.cached?.fromCache).toBe(true);
    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it('does not hold a key after a timeout that never left the ESI gate (issue #2271)', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch(
      'never-arrives',
      new EsiTimeoutError(REQUEST_TIMEOUT_MS, false)
    );

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await pending;
    settle(false);

    const fresh = vi.fn(async () => 'fresh');
    await vi.waitFor(async () => {
      const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fresh);
      expect(reread.cached?.data).toBe('fresh');
      expect(reread.cached?.fromCache).toBe(false);
    });
  });

  it('clearRevalidationFailures lets a key held by a network failure go to the network again', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('never-arrives');
    const signalled = nextRevalidation();
    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await pending;
    settle(false);
    await signalled;

    clearRevalidationFailures();

    const fresh = vi.fn(async () => 'fresh');
    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(reread.cached?.data).toBe('fresh');
  });

  it('clearRevalidationFailures keeps a key held by a 401/403, which a reconnect does not fix', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('never-arrives', new EsiError(401, 'expired'));
    const signalled = nextRevalidation();
    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
    await pending;
    settle(false);
    await signalled;

    clearRevalidationFailures();

    const fresh = vi.fn(async () => 'fresh');
    const reread = await loadWithCacheStatus<string>(CHAR_ID, KEY, fresh);
    expect(fresh).not.toHaveBeenCalled();
    expect(reread.needsReauth).toBe(true);
  });

  it('does not start another slow call after a late failure, so the signal cannot loop', async () => {
    await seedStaleRow('two-days-old');
    const { fetchLive, settle } = deferredFetch('never-arrives');
    const signalled = nextRevalidation();

    const pending = loadWithCacheStatus<string>(CHAR_ID, KEY, fetchLive);
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
    await pending;

    settle(false);
    await signalled;

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
    expect(resolved).toBe(false);

    settle(true);
    expect((await pending).cached?.data).toBe('fresh');
  });

  describe('game constants (STALE_AFTER.static) past their window', () => {
    const stationKey = 'station:60003760';
    const G = GLOBAL_CACHE_CHARACTER_ID;
    const STATIC = { staleAfterMs: STALE_AFTER.static };

    async function seedLapsedStation(value = 'Jita IV - Moon 4'): Promise<void> {
      await db.esiCache.put({
        characterId: G,
        key: stationKey,
        value,
        fetchedAt: Date.now() - STALE_AFTER.static - 60_000,
      });
    }

    it('serves the stored row at once — no grace wait — while the refresh runs behind it', async () => {
      await seedLapsedStation('Old Name');
      const { fetchLive, settle } = deferredFetch('New Name');

      const started = performance.now();
      const result = await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);

      expect(performance.now() - started).toBeLessThan(STALE_GRACE_MS);
      expect(result.cached?.data).toBe('Old Name');
      expect(result.cached?.fromCache).toBe(false);
      expect(fetchLive).toHaveBeenCalledTimes(1);

      settle(true);
      await vi.waitFor(async () => {
        expect((await db.esiCache.get([G, stationKey]))?.value).toBe('New Name');
      });
      const next = await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);
      expect(next.cached?.data).toBe('New Name');
      expect(fetchLive).toHaveBeenCalledTimes(1);
    });

    it('does not signal a revalidation — a re-render per location for a constant is all cost', async () => {
      await seedLapsedStation();
      const listener = vi.fn();
      const off = onCacheRevalidated(listener);
      const { fetchLive, settle } = deferredFetch('Jita IV - Moon 4');

      await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);
      settle(true);
      await vi.waitFor(async () => {
        expect((await db.esiCache.get([G, stationKey]))?.fetchedAt).toBeGreaterThan(
          Date.now() - 60_000
        );
      });
      await expireGrace();

      expect(listener).not.toHaveBeenCalled();
      off();
    });

    it('does not hold a lapsed constant after a refresh that timed out at the gate (issue #2271)', async () => {
      await seedLapsedStation('Old Name');
      const { fetchLive, settle } = deferredFetch(
        'never-arrives',
        new EsiTimeoutError(REQUEST_TIMEOUT_MS, false)
      );

      await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);
      settle(false);

      const fresh = vi.fn(async () => 'New Name');
      await vi.waitFor(async () => {
        await loadWithCacheStatus<string>(G, stationKey, fresh, STATIC);
        expect(fresh).toHaveBeenCalled();
      });
    });

    it('collapses concurrent reads of a lapsed constant onto one refresh', async () => {
      await seedLapsedStation();
      const { fetchLive, settle } = deferredFetch('Jita IV - Moon 4');

      await Promise.all([
        loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC),
        loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC),
      ]);

      expect(fetchLive).toHaveBeenCalledTimes(1);
      settle(true);
    });

    it('a failed refresh is reported on the next read, silently, and not retried at once', async () => {
      await seedLapsedStation();
      const listener = vi.fn();
      const off = onCacheRevalidated(listener);
      const { fetchLive, settle } = deferredFetch('never-arrives');

      await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);
      settle(false);
      await expireGrace();

      const reread = await loadWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);
      expect(reread.cached?.data).toBe('Jita IV - Moon 4');
      expect(reread.cached?.fromCache).toBe(true);
      expect(fetchLive).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
      off();
    });

    it('still blocks on the live call for a loader that opted out of stale-on-auth-failure', async () => {
      await seedLapsedStation();
      const { fetchLive, settle } = deferredFetch('Jita IV - Moon 4');

      let resolved = false;
      const pending = loadWithCacheStatus<string>(G, stationKey, fetchLive, {
        ...STATIC,
        skipCacheOnAuthFailure: true,
      }).then((r) => {
        resolved = true;
        return r;
      });
      await expireGrace();
      expect(resolved).toBe(false);

      settle(true);
      expect((await pending).cached?.data).toBe('Jita IV - Moon 4');
    });

    it('still waits when nothing is stored', async () => {
      const result = await loadWithCacheStatus<string>(
        G,
        stationKey,
        async () => 'Jita IV - Moon 4',
        STATIC
      );

      expect(result.cached?.data).toBe('Jita IV - Moon 4');
    });

    it('applies to the paginated path too', async () => {
      await db.esiCache.put({
        characterId: G,
        key: stationKey,
        value: ['a'],
        fetchedAt: Date.now() - STALE_AFTER.static - 60_000,
      });
      let settle!: () => void;
      const gate = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const fetchLive = vi.fn(async () => {
        await gate;
        return { items: ['a', 'b'], truncated: false };
      });

      const result = await loadPaginatedWithCacheStatus<string>(G, stationKey, fetchLive, STATIC);

      expect(result.cached?.data).toEqual(['a']);
      settle();
      await vi.waitFor(async () => {
        expect((await db.esiCache.get([G, stationKey]))?.value).toEqual(['a', 'b']);
      });
    });
  });

  it('never substitutes a stored row for a window between the default and a day, without the opt-in', async () => {
    const snapshotKey = 'publicBpcContracts';
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: snapshotKey,
      value: 'old',
      fetchedAt: Date.now() - 30 * 60_000 - 60_000,
    });
    const { fetchLive, settle } = deferredFetch('new');

    let resolved = false;
    const pending = loadWithCacheStatus<string>(GLOBAL_CACHE_CHARACTER_ID, snapshotKey, fetchLive, {
      staleAfterMs: 30 * 60_000,
    }).then((r) => {
      resolved = true;
      return r;
    });
    await expireGrace();
    expect(resolved).toBe(false);

    settle(true);
    expect((await pending).cached?.data).toBe('new');
  });

  it('serves the stored row for a long-window key that opts in with allowStaleServe', async () => {
    const snapshotKey = 'publicCourierContracts';
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: snapshotKey,
      value: 'last-nights-snapshot',
      fetchedAt: Date.now() - 30 * 60_000 - 60_000,
    });
    const { fetchLive, settle } = deferredFetch('fresh-snapshot');

    const pending = loadWithCacheStatus<string>(GLOBAL_CACHE_CHARACTER_ID, snapshotKey, fetchLive, {
      staleAfterMs: 30 * 60_000,
      allowStaleServe: true,
    });
    const result = await pending;

    expect(result.cached?.data).toBe('last-nights-snapshot');
    expect(result.cached?.fromCache).toBe(false);
    settle(true);
  });

  it('reports a failed background refresh on the next read of an opted-in key', async () => {
    const snapshotKey = 'publicCourierContracts';
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: snapshotKey,
      value: 'last-nights-snapshot',
      fetchedAt: Date.now() - 30 * 60_000 - 60_000,
    });
    const options = { staleAfterMs: 30 * 60_000, allowStaleServe: true };
    const failing = deferredFetch('never', new Error('offline'));
    const signalled = nextRevalidation();

    const first = loadWithCacheStatus<string>(
      GLOBAL_CACHE_CHARACTER_ID,
      snapshotKey,
      failing.fetchLive,
      options
    );
    expect((await first).cached?.fromCache).toBe(false);

    failing.settle(false);
    await signalled;

    const second = await loadWithCacheStatus<string>(
      GLOBAL_CACHE_CHARACTER_ID,
      snapshotKey,
      async () => 'unused',
      options
    );
    expect(second.cached?.data).toBe('last-nights-snapshot');
    expect(second.cached?.fromCache).toBe(true);
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
    const result = await pending;

    expect(result.cached?.data).toEqual(['a', 'b']);
    expect(result.cached?.fromCache).toBe(false);
    settle();
  });
});

describe('corpCacheKey', () => {
  const CORP_A = 98000001;
  const CORP_B = 98000002;

  it('embeds the corporation id under the corp prefix', () => {
    expect(corpCacheKey(CORP_A, 'structures')).toBe(`${CORP_CACHE_KEY_PREFIX}98000001:structures`);
  });

  it('gives two corporations different keys for the same data', () => {
    expect(corpCacheKey(CORP_A, 'structures')).not.toBe(corpCacheKey(CORP_B, 'structures'));
  });

  it('never collides with the plain character-scoped key of the same name', () => {
    expect(corpCacheKey(CORP_A, 'structures')).not.toBe('structures');
  });

  it('makes a cross-corp read impossible: corp A rows are not served to a corp B read', async () => {
    const fetchA = vi.fn().mockResolvedValue('corp A structures');
    await loadWithCache(CHAR_ID, corpCacheKey(CORP_A, 'structures'), fetchA);

    const fetchB = vi.fn().mockResolvedValue('corp B structures');
    const result = await loadWithCache<string>(CHAR_ID, corpCacheKey(CORP_B, 'structures'), fetchB);

    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(result?.data).toBe('corp B structures');
    expect(await readCached(CHAR_ID, corpCacheKey(CORP_A, 'structures'))).toBe('corp A structures');
  });
});

describe('loadWithCacheStatus — fetchFailed (issue #2691)', () => {
  const OPT = { reportFetchFailure: true };

  it('is off unless asked for: the result shape is unchanged', async () => {
    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => {
      throw new EsiError(503, 'unavailable');
    });
    expect(result).toEqual({ cached: null, needsReauth: false });
  });

  it('cold cache + 5xx: cached null, fetchFailed true', async () => {
    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(503, 'unavailable');
      },
      OPT
    );
    expect(result).toEqual({ cached: null, needsReauth: false, fetchFailed: true });
  });

  it('cold cache + offline (plain throw): fetchFailed true', async () => {
    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new Error('offline');
      },
      OPT
    );
    expect(result.fetchFailed).toBe(true);
  });

  it('warm cache + 5xx: keeps the cached row, no fetchFailed', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1234 });
    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(503, 'unavailable');
      },
      OPT
    );
    expect(result.cached).toMatchObject({ data: 'stale', fromCache: true });
    expect(result.fetchFailed).toBeUndefined();
  });

  it('auth failure with no cache: needsReauth, not fetchFailed', async () => {
    const result = await loadWithCacheStatus(
      CHAR_ID,
      KEY,
      async () => {
        throw new EsiError(403, 'forbidden');
      },
      OPT
    );
    expect(result.needsReauth).toBe(true);
    expect(result.fetchFailed).toBeUndefined();
  });

  it('success leaves the field unset', async () => {
    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => 'live', OPT);
    expect(result).not.toHaveProperty('fetchFailed');
  });
});
