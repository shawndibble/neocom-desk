import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { loadPriceHistory } from './priceHistory';

const REGION_ID = 10000002; // The Forge
const TYPE_ID = 34; // Tritanium

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
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
    expect(result.points).toEqual([
      { date: '2026-08-01', average: 5, volume: 50 },
      { date: '2026-08-30', average: 5.5, volume: 100 },
    ]);
  });

  it('returns an empty points array when ESI has no history for the item', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/history`, () => HttpResponse.json([]))
    );

    const result = await loadPriceHistory(REGION_ID, TYPE_ID);
    expect(result.points).toEqual([]);
  });
});
