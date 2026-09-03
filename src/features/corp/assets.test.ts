import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { db } from '@/db';
import { CORP_ASSETS_KEY, loadCorporationAssets } from './assets';

const CHAR_ID = 91;
const CORP_ID = 98000001;
const OTHER_CORP_ID = 98000002;

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

function assetsUrl(corporationId: number) {
  return `${ESI_BASE_URL}/corporations/${corporationId}/assets`;
}

/** One row per hangar division, which is what makes a corp asset list corp-shaped. */
const ASSETS = [
  {
    item_id: 1001,
    type_id: 34,
    quantity: 5000,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG1',
    is_singleton: false,
  },
  {
    item_id: 1002,
    type_id: 35,
    quantity: 20,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG7',
    is_singleton: false,
  },
];

describe('loadCorporationAssets', () => {
  it('fetches the corporation assets and caches them under a corp-scoped key', async () => {
    server.use(http.get(assetsUrl(CORP_ID), () => HttpResponse.json(ASSETS)));

    const result = await loadCorporationAssets(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(ASSETS);
    expect(result.needsReauth).toBe(false);
    const row = await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, CORP_ASSETS_KEY)]);
    expect(row?.value).toEqual(ASSETS);
  });

  /** Issue #293's guarantee: hangar contents must never cross a corporation change. */
  it('never serves one corporation rows under another', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, CORP_ASSETS_KEY),
      value: ASSETS,
      fetchedAt: STALE_FETCHED_AT,
    });

    server.use(http.get(assetsUrl(OTHER_CORP_ID), () => HttpResponse.error()));
    const result = await loadCorporationAssets(CHAR_ID, OTHER_CORP_ID);

    expect(result.cached).toBeNull();
  });

  /** The key must also not collide with the character list's plain `assets` row. */
  it('does not write the character assets key', async () => {
    server.use(http.get(assetsUrl(CORP_ID), () => HttpResponse.json(ASSETS)));

    await loadCorporationAssets(CHAR_ID, CORP_ID);

    expect(await db.esiCache.get([CHAR_ID, 'assets'])).toBeUndefined();
  });

  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(
      http.get(assetsUrl(CORP_ID), () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 }))
    );

    const result = await loadCorporationAssets(CHAR_ID, CORP_ID);

    // Director is the only role this endpoint accepts, so a 403 here is the
    // commonest corp answer of all — and no login can change it.
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });

  it('still reports a 401 as needing re-auth', async () => {
    server.use(
      http.get(assetsUrl(CORP_ID), () =>
        HttpResponse.json({ error: 'token expired' }, { status: 401 })
      )
    );

    const result = await loadCorporationAssets(CHAR_ID, CORP_ID);

    expect(result.needsReauth).toBe(true);
  });

  it('falls back to the cached corp rows when the live call fails', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, CORP_ASSETS_KEY),
      value: ASSETS,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(http.get(assetsUrl(CORP_ID), () => HttpResponse.error()));

    const result = await loadCorporationAssets(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(ASSETS);
    expect(result.cached?.fromCache).toBe(true);
  });
});
