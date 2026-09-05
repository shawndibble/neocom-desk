import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import type { CorporationAsset } from '@/esi/endpoints';
import {
  CORP_ASSETS_KEY,
  loadCorporationAssets,
  loadCorpAssetLabels,
  toCorpAssetInputs,
} from './assets';

/**
 * `loadTypeNames` reads the SDE snapshot off disk before it touches ESI and
 * has its own tests for that. Stubbing it keeps these cases about the label
 * loader's own name-resolution split, the same reason `members.test.ts`
 * stubs it.
 */
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, `Type ${id}`]))
  ),
}));

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
const ASSETS: CorporationAsset[] = [
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

describe('toCorpAssetInputs', () => {
  it('adapts ESI snake_case rows into the engine-native shape groupCorpAssets takes', () => {
    expect(toCorpAssetInputs(ASSETS)).toEqual([
      { itemId: 1001, typeId: 34, quantity: 5000, locationId: 60003760, locationFlag: 'CorpSAG1' },
      { itemId: 1002, typeId: 35, quantity: 20, locationId: 60003760, locationFlag: 'CorpSAG7' },
    ]);
  });
});

describe('loadCorpAssetLabels', () => {
  it('resolves type names through loadTypeNames', async () => {
    const labels = await loadCorpAssetLabels(CHAR_ID, ASSETS);
    expect(labels.types.get(34)).toBe('Type 34');
    expect(labels.types.get(35)).toBe('Type 35');
  });

  it('resolves a shared NPC-station location in a single /universe/names call', async () => {
    let nameCalls = 0;
    let batched: number[] = [];
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        nameCalls += 1;
        batched = (await request.json()) as number[];
        return HttpResponse.json(
          batched.map((id) => ({ id, name: `Location ${id}`, category: 'station' }))
        );
      })
    );

    const labels = await loadCorpAssetLabels(CHAR_ID, ASSETS);

    // Both rows share location_id 60003760 — one distinct location, one call.
    expect(nameCalls).toBe(1);
    expect(batched).toEqual([60003760]);
    expect(labels.locations.get(60003760)).toBe('Location 60003760');
  });

  /**
   * Same split as `features/corp/members.ts`'s `resolveLocationNames`:
   * `/universe/names` 404s the whole batch on one bad id, and an Upwell
   * structure has no bulk endpoint at all, so it is resolved on its own.
   */
  it('resolves an Upwell structure separately from the bulk batch', async () => {
    const STRUCTURE_ID = 1035466617946;
    let structureCalls = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        expect(ids).not.toContain(STRUCTURE_ID);
        return HttpResponse.json(
          ids.map((id) => ({ id, name: `Location ${id}`, category: 'station' }))
        );
      }),
      http.get(`${ESI_BASE_URL}/universe/structures/${STRUCTURE_ID}`, () => {
        structureCalls += 1;
        return HttpResponse.json({
          name: 'X-7OMU - Home Office',
          owner_id: 1,
          solar_system_id: 30000001,
        });
      })
    );

    const assets = ASSETS.map((asset) => ({ ...asset, location_id: STRUCTURE_ID }));
    const labels = await loadCorpAssetLabels(CHAR_ID, assets);

    expect(structureCalls).toBe(1);
    expect(labels.locations.get(STRUCTURE_ID)).toBe('X-7OMU - Home Office');
  });

  /** A structure the reading Character is not on the ACL for is simply absent, same as Assets. */
  it('leaves an unresolvable structure out of the map rather than throwing', async () => {
    const STRUCTURE_ID = 1035466617946;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/${STRUCTURE_ID}`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    const assets = ASSETS.map((asset) => ({ ...asset, location_id: STRUCTURE_ID }));
    const labels = await loadCorpAssetLabels(CHAR_ID, assets);

    expect(labels.locations.has(STRUCTURE_ID)).toBe(false);
  });

  /**
   * Issue #420: a large corp can hold assets scattered across many Upwell
   * structures, each resolved with its own `/universe/structures/{id}` call
   * (no bulk endpoint exists for them). A bare `Promise.all` over all of them
   * risks 429s; `src/lib/concurrency.ts` is the repo's one fan-out policy for
   * exactly this, so this pins the cap rather than trusting the shape of the
   * code.
   */
  it('caps the per-structure name-resolution fan-out instead of firing every request at once', async () => {
    const FLOOR = 1_000_000_000_000;
    const structureIds = Array.from({ length: ESI_FANOUT_CONCURRENCY + 5 }, (_, i) => FLOOR + i);
    const assets = structureIds.map((locationId, i): CorporationAsset => ({
      item_id: 3000 + i,
      type_id: 34,
      quantity: 1,
      location_id: locationId,
      location_type: 'other',
      location_flag: 'CorpSAG1',
      is_singleton: false,
    }));

    let inFlight = 0;
    let peak = 0;
    server.use(
      ...structureIds.map((id) =>
        http.get(`${ESI_BASE_URL}/universe/structures/${id}`, async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 0));
          inFlight -= 1;
          return HttpResponse.json({
            name: `Structure ${id}`,
            owner_id: 1,
            solar_system_id: 30000001,
          });
        })
      )
    );

    const labels = await loadCorpAssetLabels(CHAR_ID, assets);

    expect(labels.locations.size).toBe(structureIds.length);
    expect(peak).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });
});
