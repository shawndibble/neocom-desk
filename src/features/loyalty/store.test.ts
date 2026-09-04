import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { loadLoyaltyStoreOffers, loadCorporationName } from './store';

const CORP_ID = 1000135;
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

describe('loadLoyaltyStoreOffers', () => {
  it('fetches and caches the offers payload without requiring a character token', async () => {
    const payload = [
      {
        isk_cost: 12_000_000,
        lp_cost: 950_000,
        offer_id: 1,
        quantity: 1,
        required_items: [],
        type_id: 33397,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/loyalty/stores/${CORP_ID}/offers/`, () =>
        HttpResponse.json(payload)
      )
    );
    const result = await loadLoyaltyStoreOffers(CORP_ID);
    expect(result?.data).toEqual(payload);
    expect(
      (await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, `loyalty-store-offers:${CORP_ID}`]))?.value
    ).toEqual(payload);
  });

  it('falls back to cache offline', async () => {
    const payload = [
      { isk_cost: 1, lp_cost: 1, offer_id: 1, quantity: 1, required_items: [], type_id: 1 },
    ];
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: `loyalty-store-offers:${CORP_ID}`,
      value: payload,
      fetchedAt: 2,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/loyalty/stores/${CORP_ID}/offers/`, () => HttpResponse.error())
    );
    const result = await loadLoyaltyStoreOffers(CORP_ID);
    expect(result?.data).toEqual(payload);
    expect(result?.fromCache).toBe(true);
  });
});

describe('loadCorporationName', () => {
  it('resolves and caches the corporation name', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}`, () =>
        HttpResponse.json({
          name: 'Sisters of Eve',
          ticker: 'SOE',
          ceo_id: 1,
          creator_id: 1,
          member_count: 1,
          tax_rate: 0,
        })
      )
    );
    const name = await loadCorporationName(CORP_ID);
    expect(name).toBe('Sisters of Eve');
  });

  it('returns null when unresolvable offline and uncached', async () => {
    server.use(http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}`, () => HttpResponse.error()));
    const name = await loadCorporationName(CORP_ID);
    expect(name).toBeNull();
  });
});
