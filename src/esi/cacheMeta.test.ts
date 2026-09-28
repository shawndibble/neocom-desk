/**
 * Freshness from `esiCacheMeta` (value-free) and ETag revalidation.
 *
 * The cost these pin is deserializing a cached value — megabytes for assets —
 * just to learn that it is stale, or to rewrite an identical payload after a
 * 304. `db.esiCache.get` is the only way a value is read, so it is what these
 * spy on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import {
  conditionalFetch,
  invalidateFreshness,
  isCacheFresh,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  resetRevalidationState,
  STALE_AFTER,
} from './cache';
import {
  clearCachePurgePending,
  purgeCharacterCache,
  purgeCharacterCacheOrSuppress,
} from './cachePurge';
import type { EsiResult } from './client';

const CHAR_ID = 91;
const KEY = 'thing';
const T0 = 1_000_000;

function at(ms: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  at(0);
  invalidateFreshness();
  await clearCachePurgePending(CHAR_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('freshness from meta', () => {
  it('a lapsed row goes live without deserializing the stored value', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'old');
    at(T0 + STALE_AFTER.default + 1);
    const get = vi.spyOn(db.esiCache, 'get');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => 'new');

    expect(result.cached?.data).toBe('new');
    expect(get).not.toHaveBeenCalled();
  });

  it('a fresh row reads its value exactly once', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    const get = vi.spyOn(db.esiCache, 'get');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, async () => 'unused');

    expect(result.cached).toEqual({
      data: 'v',
      fetchedAt: new Date(T0),
      fromCache: false,
      truncated: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('a row written before meta existed is served the old way, then gains its meta', async () => {
    at(T0);
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'legacy', fetchedAt: T0 });
    await db.esiCacheMeta.clear();
    const fetchLive = vi.fn(async () => 'live');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).not.toHaveBeenCalled();
    expect(result.cached?.data).toBe('legacy');
    await vi.waitFor(async () =>
      expect(await db.esiCacheMeta.get([CHAR_ID, KEY])).toEqual({
        characterId: CHAR_ID,
        key: KEY,
        fetchedAt: T0,
      })
    );
  });

  it('meta whose value is gone is a miss, not a fresh hit — and is dropped', async () => {
    at(T0);
    await db.esiCacheMeta.put({ characterId: CHAR_ID, key: KEY, fetchedAt: T0 });
    const fetchLive = vi.fn(async () => 'live');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.cached?.data).toBe('live');
  });

  it('a value rewritten behind meta (raw IndexedDB, a pre-meta bundle) is judged by its own age', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    // What e2e's expireCachedEsiRows does: backdate the value row through raw
    // IndexedDB, which the Dexie middleware never sees.
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'old', fetchedAt: 1 });
    await db.esiCacheMeta.put({ characterId: CHAR_ID, key: KEY, fetchedAt: T0 });
    const fetchLive = vi.fn(async () => 'live');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, fetchLive);

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.cached?.data).toBe('live');
  });

  it('a partial list checks the stored row for truncation without reading its value', async () => {
    at(T0);
    await loadPaginatedWithCacheStatus(CHAR_ID, KEY, async () => ({
      items: [1],
      truncated: true,
    }));
    at(T0 + STALE_AFTER.default + 1);
    const get = vi.spyOn(db.esiCache, 'get');

    const result = await loadPaginatedWithCacheStatus(CHAR_ID, KEY, async () => ({
      items: [1, 2],
      truncated: true,
    }));

    expect(result.cached?.data).toEqual([1, 2]);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('isCacheFresh', () => {
  it('is true inside the window and false past it', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(true);
    at(T0 + STALE_AFTER.default + 1);
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(false);
  });

  it('never reads the value', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    const get = vi.spyOn(db.esiCache, 'get');
    await isCacheFresh(CHAR_ID, KEY);
    expect(get).not.toHaveBeenCalled();
  });

  it('is false with no row, and for a legacy row with no meta yet', async () => {
    at(T0);
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(false);
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'legacy', fetchedAt: T0 });
    await db.esiCacheMeta.clear();
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(false);
  });

  it('is false for orphaned meta, so a skip can never leave a row missing', async () => {
    at(T0);
    await db.esiCacheMeta.put({ characterId: CHAR_ID, key: KEY, fetchedAt: T0 });
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(false);
  });

  it('is false right after a manual refresh', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    invalidateFreshness();
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(false);
  });

  it('honours a longer window', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v', { staleAfterMs: STALE_AFTER.static });
    at(T0 + STALE_AFTER.default + 1);
    expect(await isCacheFresh(CHAR_ID, KEY, STALE_AFTER.static)).toBe(true);
  });
});

describe('purges take meta with them', () => {
  it('purgeCharacterCache removes value and meta', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    await purgeCharacterCache(CHAR_ID);
    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeUndefined();
    expect(await db.esiCacheMeta.get([CHAR_ID, KEY])).toBeUndefined();
  });

  it('the purge-or-suppress path too', async () => {
    at(T0);
    await loadWithCacheStatus(CHAR_ID, KEY, async () => 'v');
    await purgeCharacterCacheOrSuppress(CHAR_ID);
    expect(await db.esiCacheMeta.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ETag revalidation
// ---------------------------------------------------------------------------

function esiResult<T>(over: Partial<EsiResult<T>>): EsiResult<T> {
  return { data: null, etag: null, pages: 1, expires: null, notModified: false, ...over };
}

describe('conditional revalidation (ETag / 304)', () => {
  it('stores the ETag with the row', async () => {
    at(T0);
    const { fetchLive, conditional } = conditionalFetch(async () =>
      esiResult({ data: 'v1', etag: '"e1"' })
    );
    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { conditional });
    expect((await db.esiCacheMeta.get([CHAR_ID, KEY]))?.etag).toBe('"e1"');
    expect((await db.esiCache.get([CHAR_ID, KEY]))?.etag).toBe('"e1"');
  });

  it('sends the stored ETag and, on a 304, bumps only the freshness — the value is not rewritten', async () => {
    at(T0);
    const first = conditionalFetch(async () => esiResult({ data: 'v1', etag: '"e1"' }));
    await loadWithCacheStatus(CHAR_ID, KEY, first.fetchLive, { conditional: first.conditional });

    const later = T0 + STALE_AFTER.default + 1;
    at(later);
    const expires = new Date(later + 3_600_000);
    const sent: Array<string | undefined> = [];
    const second = conditionalFetch(async ({ etag }) => {
      sent.push(etag);
      return esiResult({ notModified: true, etag: '"e1"', expires: expires.toUTCString() });
    });
    const put = vi.spyOn(db.esiCache, 'put');

    const result = await loadWithCacheStatus(CHAR_ID, KEY, second.fetchLive, {
      conditional: second.conditional,
    });

    expect(sent).toEqual(['"e1"']);
    expect(put).not.toHaveBeenCalled();
    expect(result).toEqual({
      cached: { data: 'v1', fetchedAt: new Date(later), fromCache: false, truncated: false },
      needsReauth: false,
    });
    const meta = await db.esiCacheMeta.get([CHAR_ID, KEY]);
    expect(meta?.fetchedAt).toBe(later);
    expect(meta?.expiresAt).toBe(Date.parse(expires.toUTCString()));
    // The value row itself is untouched.
    expect((await db.esiCache.get([CHAR_ID, KEY]))?.fetchedAt).toBe(T0);
    // And the bump holds: the next read is fresh.
    expect(await isCacheFresh(CHAR_ID, KEY)).toBe(true);
  });

  it('sends no ETag when nothing is cached', async () => {
    at(T0);
    const sent: Array<string | undefined> = [];
    const { fetchLive, conditional } = conditionalFetch(async ({ etag }) => {
      sent.push(etag);
      return esiResult({ data: 'v1', etag: '"e1"' });
    });
    await loadWithCacheStatus(CHAR_ID, KEY, fetchLive, { conditional });
    expect(sent).toEqual([undefined]);
  });

  it('a 304 whose row has since changed refetches unconditionally', async () => {
    at(T0);
    const first = conditionalFetch(async () => esiResult({ data: 'v1', etag: '"e1"' }));
    await loadWithCacheStatus(CHAR_ID, KEY, first.fetchLive, { conditional: first.conditional });
    // Someone rewrote the row without an ETag (a stale bundle, a test seed)
    // but meta still names the old one.
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'other', fetchedAt: T0 });
    await db.esiCacheMeta.put({ characterId: CHAR_ID, key: KEY, fetchedAt: T0, etag: '"e1"' });

    at(T0 + STALE_AFTER.default + 1);
    const sent: Array<string | undefined> = [];
    const second = conditionalFetch(async ({ etag }) => {
      sent.push(etag);
      return etag
        ? esiResult({ notModified: true, etag })
        : esiResult({ data: 'v2', etag: '"e2"' });
    });
    const result = await loadWithCacheStatus(CHAR_ID, KEY, second.fetchLive, {
      conditional: second.conditional,
    });

    expect(sent).toEqual(['"e1"', undefined]);
    expect(result.cached?.data).toBe('v2');
    expect((await db.esiCacheMeta.get([CHAR_ID, KEY]))?.etag).toBe('"e2"');
  });

  it('a 304 with the row purged meanwhile refetches unconditionally', async () => {
    at(T0);
    const first = conditionalFetch(async () => esiResult({ data: 'v1', etag: '"e1"' }));
    await loadWithCacheStatus(CHAR_ID, KEY, first.fetchLive, { conditional: first.conditional });

    at(T0 + STALE_AFTER.default + 1);
    const sent: Array<string | undefined> = [];
    const second = conditionalFetch(async ({ etag }) => {
      sent.push(etag);
      if (etag) {
        await db.esiCache.delete([CHAR_ID, KEY]);
        return esiResult({ notModified: true, etag });
      }
      return esiResult({ data: 'v2', etag: '"e2"' });
    });
    const result = await loadWithCacheStatus(CHAR_ID, KEY, second.fetchLive, {
      conditional: second.conditional,
    });

    expect(sent).toEqual(['"e1"', undefined]);
    expect(result.cached?.data).toBe('v2');
  });

  it('a failed conditional call still falls back to the stored row', async () => {
    at(T0);
    const first = conditionalFetch(async () => esiResult({ data: 'v1', etag: '"e1"' }));
    await loadWithCacheStatus(CHAR_ID, KEY, first.fetchLive, { conditional: first.conditional });

    at(T0 + STALE_AFTER.default + 1);
    const second = conditionalFetch(async () => {
      throw new Error('offline');
    });
    const result = await loadWithCacheStatus(CHAR_ID, KEY, second.fetchLive, {
      conditional: second.conditional,
    });
    expect(result.cached).toMatchObject({ data: 'v1', fromCache: true });
  });
});
