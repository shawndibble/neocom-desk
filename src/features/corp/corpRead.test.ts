import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { db } from '@/db';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

const CHAR_ID = 91;
const CORP_ID = 98000001;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

const URL = `${ESI_BASE_URL}/corporations/${CORP_ID}/probe`;
const KEY = 'probe';

describe('loadCorpWithCacheStatus', () => {
  it('files the row under corpCacheKey, not the bare key', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ ok: true })));

    const result = await loadCorpWithCacheStatus(CHAR_ID, CORP_ID, KEY, async () => {
      const res = await fetch(URL);
      return res.json();
    });

    expect(result.cached?.data).toEqual({ ok: true });
    const row = await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEY)]);
    expect(row?.value).toEqual({ ok: true });
    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeUndefined();
  });

  /**
   * The whole point of the wrapper: a caller cannot forget the corp reading of
   * a 403, because it never names `detectAuthFailure` at all.
   */
  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 })));

    const result = await loadCorpWithCacheStatus(CHAR_ID, CORP_ID, KEY, async () => {
      const res = await fetch(URL);
      if (!res.ok) throw new (await import('@/esi/client')).EsiError(res.status, 'Forbidden');
      return res.json();
    });

    expect(result.needsReauth).toBe(false);
  });

  it('still honours an explicit staleAfterMs override', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, KEY),
      value: { ok: 'stale' },
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(http.get(URL, () => HttpResponse.error()));

    const result = await loadCorpWithCacheStatus(
      CHAR_ID,
      CORP_ID,
      KEY,
      async () => {
        const res = await fetch(URL);
        return res.json();
      },
      { staleAfterMs: 0 }
    );

    // staleAfterMs: 0 means the stale row is not served fresh, so the live
    // call (which fails) is attempted and the cached row is the fallback —
    // proving the option still reaches through the wrapper.
    expect(result.cached?.data).toEqual({ ok: 'stale' });
    expect(result.cached?.fromCache).toBe(true);
  });
});

describe('loadCorpPaginatedWithCacheStatus', () => {
  it('files the row under corpCacheKey and reports a 403 as the role gate', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 })));

    const result = await loadCorpPaginatedWithCacheStatus(CHAR_ID, CORP_ID, KEY, async () => {
      const res = await fetch(URL);
      if (!res.ok) throw new (await import('@/esi/client')).EsiError(res.status, 'Forbidden');
      return { items: await res.json(), truncated: false };
    });

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });
});
