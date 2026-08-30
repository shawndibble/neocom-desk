import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadOrders, loadOrderHistory } from './orders';

const CHAR_ID = 91;
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

const ORDER = {
  order_id: 1,
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  is_buy_order: false,
  is_corporation: false,
  price: 5.5,
  volume_remain: 100,
  volume_total: 200,
  issued: '2026-08-01T00:00:00Z',
  duration: 90,
  range: 'region',
};

describe('loadOrders', () => {
  it('fetches open orders and caches them', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/orders`, () => HttpResponse.json([ORDER]))
    );
    const result = await loadOrders(CHAR_ID);
    expect(result?.data).toEqual([ORDER]);
    expect((await db.esiCache.get([CHAR_ID, 'orders']))?.value).toEqual([ORDER]);
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'orders', value: [ORDER], fetchedAt: 4 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/orders`, () => HttpResponse.error())
    );
    const result = await loadOrders(CHAR_ID);
    expect(result).toEqual({
      data: [ORDER],
      fetchedAt: new Date(4),
      fromCache: true,
      truncated: false,
    });
  });
});

describe('loadOrderHistory', () => {
  it('concatenates every page and caches the combined result', async () => {
    const history = { ...ORDER, state: 'expired' as const };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/orders/history`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json([{ ...history, order_id: page === '2' ? 2 : 1 }], {
          headers: { 'X-Pages': '2' },
        });
      })
    );

    const result = await loadOrderHistory(CHAR_ID);

    expect(result?.data.map((o) => o.order_id)).toEqual([1, 2]);
  });
});
