import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { getOrderBook, clearOrderBookCache, ORDER_BOOK_TTL_MS } from './orderBook';

const REGION_ID = 10000002; // The Forge
const TYPE_ID = 34; // Tritanium

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearOrderBookCache();
});
afterAll(() => server.close());

function ordersHandler(hits: { count: number }) {
  return http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/orders`, ({ request }) => {
    hits.count += 1;
    const url = new URL(request.url);
    expect(url.searchParams.get('type_id')).toBe(String(TYPE_ID));
    expect(url.searchParams.get('order_type')).toBe('all');
    return HttpResponse.json(
      [
        {
          order_id: 1,
          type_id: TYPE_ID,
          is_buy_order: false,
          price: 5,
          location_id: 60003760,
          system_id: 30000142,
          volume_remain: 100,
          volume_total: 100,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
      ],
      { headers: { 'X-Pages': '1' } }
    );
  });
}

describe('getOrderBook', () => {
  it('fetches from ESI and caches for the 300-second TTL', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    const first = await getOrderBook(REGION_ID, TYPE_ID, clock);
    expect(first.orders).toHaveLength(1);
    expect(first.truncated).toBe(false);
    expect(first.fetchedAt).toBe(1_000_000);
    expect(hits.count).toBe(1);

    now += 1000; // well within TTL
    const second = await getOrderBook(REGION_ID, TYPE_ID, clock);
    expect(second.fetchedAt).toBe(1_000_000); // preserved from the original fetch
    expect(hits.count).toBe(1); // served from cache
  });

  it('re-fetches once the 300-second TTL has elapsed', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    await getOrderBook(REGION_ID, TYPE_ID, clock);
    expect(hits.count).toBe(1);

    now += ORDER_BOOK_TTL_MS + 1;
    const refetched = await getOrderBook(REGION_ID, TYPE_ID, clock);
    expect(refetched.fetchedAt).toBe(now);
    expect(hits.count).toBe(2);
  });

  it('clearOrderBookCache forces the next call to refetch (manual refresh)', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));

    await getOrderBook(REGION_ID, TYPE_ID);
    expect(hits.count).toBe(1);

    clearOrderBookCache();
    await getOrderBook(REGION_ID, TYPE_ID);
    expect(hits.count).toBe(2);
  });

  it('clearOrderBookCache(region, type) only invalidates that one entry, leaving others cached', async () => {
    const OTHER_TYPE_ID = 35;
    const hitsByType = new Map<string, number>();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/orders`, ({ request }) => {
        const typeId = new URL(request.url).searchParams.get('type_id') ?? '';
        hitsByType.set(typeId, (hitsByType.get(typeId) ?? 0) + 1);
        return HttpResponse.json([], { headers: { 'X-Pages': '1' } });
      })
    );

    await getOrderBook(REGION_ID, TYPE_ID);
    await getOrderBook(REGION_ID, OTHER_TYPE_ID);
    expect(hitsByType.get(String(TYPE_ID))).toBe(1);
    expect(hitsByType.get(String(OTHER_TYPE_ID))).toBe(1);

    clearOrderBookCache(REGION_ID, TYPE_ID);
    await getOrderBook(REGION_ID, TYPE_ID); // cleared: refetches
    await getOrderBook(REGION_ID, OTHER_TYPE_ID); // untouched: still cached
    expect(hitsByType.get(String(TYPE_ID))).toBe(2);
    expect(hitsByType.get(String(OTHER_TYPE_ID))).toBe(1);
  });

  it('coalesces concurrent calls for the same region/type into one ESI request', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));

    const [first, second] = await Promise.all([
      getOrderBook(REGION_ID, TYPE_ID),
      getOrderBook(REGION_ID, TYPE_ID),
    ]);
    expect(hits.count).toBe(1);
    expect(first).toEqual(second);
  });
});
