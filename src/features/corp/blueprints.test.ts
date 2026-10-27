import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { db } from '@/db';
import type { CorporationBlueprint } from '@/esi/endpoints';
import { CORP_BLUEPRINTS_KEY, loadCorporationBlueprints } from './blueprints';

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

function blueprintsUrl(corporationId: number) {
  return `${ESI_BASE_URL}/corporations/${corporationId}/blueprints`;
}

const BLUEPRINTS: CorporationBlueprint[] = [
  {
    item_id: 1001,
    type_id: 681,
    runs: -1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: 1,
    location_id: 60003760,
    location_flag: 'CorpSAG1',
  },
];

describe('loadCorporationBlueprints', () => {
  it('fetches the corporation blueprints and caches them under a corp-scoped key', async () => {
    server.use(http.get(blueprintsUrl(CORP_ID), () => HttpResponse.json(BLUEPRINTS)));

    const result = await loadCorporationBlueprints(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(BLUEPRINTS);
    expect(result.needsReauth).toBe(false);
    const row = await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, CORP_BLUEPRINTS_KEY)]);
    expect(row?.value).toEqual(BLUEPRINTS);
  });

  /** Same guarantee #293 gives every corp-owned read: never serve one corporation's rows under another. */
  it('never serves one corporation rows under another', async () => {
    server.use(http.get(blueprintsUrl(CORP_ID), () => HttpResponse.json(BLUEPRINTS)));
    await loadCorporationBlueprints(CHAR_ID, CORP_ID);

    server.use(http.get(blueprintsUrl(OTHER_CORP_ID), () => HttpResponse.error()));
    const result = await loadCorporationBlueprints(CHAR_ID, OTHER_CORP_ID);

    expect(result.cached).toBeNull();
  });

  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(
      http.get(blueprintsUrl(CORP_ID), () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    const result = await loadCorporationBlueprints(CHAR_ID, CORP_ID);

    // Director is the only role this endpoint accepts, so a 403 is the
    // commonest corp answer of all — and no login can change it.
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });

  it('still reports a 401 as needing re-auth', async () => {
    server.use(
      http.get(blueprintsUrl(CORP_ID), () =>
        HttpResponse.json({ error: 'token expired' }, { status: 401 })
      )
    );

    const result = await loadCorporationBlueprints(CHAR_ID, CORP_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});
