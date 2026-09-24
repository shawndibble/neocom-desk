import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { db } from '@/db';
import { loadPriceHistory } from './priceHistory';

const REGION_ID = 10000002; // The Forge
const TYPE_ID = 34; // Tritanium

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadPriceHistory', () => {
  it('fetches, sorts and maps ESI history into chart points', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/history`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('type_id')).toBe(String(TYPE_ID));
        return HttpResponse.json([
          { date: '2026-08-30', average: 5.5, highest: 6, lowest: 5, order_count: 3, volume: 100 },
          { date: '2026-08-01', average: 5, highest: 5.5, lowest: 4.5, order_count: 2, volume: 50 },
        ]);
      })
    );

    const result = await loadPriceHistory(REGION_ID, TYPE_ID);
    // Every field the endpoint sends, including the day's own extremes and
    // its order count — the chart's band and activity strip are drawn from
    // these, and dropping them here is what used to hide them.
    expect(result.points).toEqual([
      { date: '2026-08-01', average: 5, highest: 5.5, lowest: 4.5, volume: 50, orderCount: 2 },
      { date: '2026-08-30', average: 5.5, highest: 6, lowest: 5, volume: 100, orderCount: 3 },
    ]);
  });

  it('returns an empty points array when ESI has no history for the item', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/history`, () => HttpResponse.json([]))
    );

    const result = await loadPriceHistory(REGION_ID, TYPE_ID);
    expect(result.points).toEqual([]);
  });

  // Sentry flagged the Mining Overview's per-type fan-out as an N+1: every
  // visit re-fetched every ore's history although ESI only publishes it once
  // a day. A repeat call inside the window must not touch the network � with
  // no handler registered, `onUnhandledRequest: 'error'` proves it.
  it('serves a repeat call from the cache without a second request', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/markets/${REGION_ID}/history`,
        () =>
          HttpResponse.json([
            {
              date: '2026-08-30',
              average: 5.5,
              highest: 6,
              lowest: 5,
              order_count: 3,
              volume: 100,
            },
          ]),
        { once: true }
      )
    );

    await loadPriceHistory(REGION_ID, TYPE_ID);
    const second = await loadPriceHistory(REGION_ID, TYPE_ID);
    expect(second.points.map((p) => p.average)).toEqual([5.5]);
  });

  // The Mining Overview tolerates exactly this rejection per type (a
  // non-tradable ore) and fails on anything else, so the cache must not turn
  // it into a silent empty result.
  it('still rejects with the ESI error when nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/history`, () =>
        HttpResponse.json({ error: 'Type not found' }, { status: 400 })
      )
    );

    const err = await loadPriceHistory(REGION_ID, TYPE_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiError);
    expect((err as EsiError).status).toBe(400);
  });
});
