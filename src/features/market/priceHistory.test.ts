import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { ESI_BASE_URL } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { db } from '@/db';
import { loadPriceHistory } from './priceHistory';

const REGION_ID = 10000002;
const TYPE_ID = 34;

const server = mswServer();

beforeEach(async () => {
  await db.esiCache.clear();
});

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
    expect(result.fromCache).toBe(false);
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

  it('rejects every caller with a 400 for a non-tradable type, and caches that answer', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/markets/${REGION_ID}/history`,
        () => HttpResponse.json({ error: 'Type not found' }, { status: 400 }),
        { once: true }
      )
    );

    const errors = await Promise.all([
      loadPriceHistory(REGION_ID, TYPE_ID).catch((e: unknown) => e),
      loadPriceHistory(REGION_ID, TYPE_ID).catch((e: unknown) => e),
    ]);
    const later = await loadPriceHistory(REGION_ID, TYPE_ID).catch((e: unknown) => e);
    for (const err of [...errors, later]) {
      expect(err).toBeInstanceOf(EsiError);
      expect((err as EsiError).status).toBe(400);
    }
  });
});
