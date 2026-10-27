import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';
import { fetchAdjustedPrices } from './esiPrices';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchAdjustedPrices', () => {
  it('sends the mandatory ESI headers and maps type_id to adjusted/average', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/prices`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json([
          { type_id: 34, adjusted_price: 5.5, average_price: 5.2 },
          { type_id: 35, adjusted_price: 12.1, average_price: 11.9 },
        ]);
      })
    );

    const result = await fetchAdjustedPrices();

    expect(result.get(34)).toEqual({ adjusted: 5.5, average: 5.2 });
    expect(result.get(35)).toEqual({ adjusted: 12.1, average: 11.9 });
  });

  it('reports null rather than 0 when adjusted_price or average_price is absent', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/prices`, () => HttpResponse.json([{ type_id: 34 }]))
    );

    const result = await fetchAdjustedPrices();

    expect(result.get(34)).toEqual({ adjusted: null, average: null });
  });

  it('returns an empty map for an empty response', async () => {
    server.use(http.get(`${ESI_BASE_URL}/markets/prices`, () => HttpResponse.json([])));

    const result = await fetchAdjustedPrices();

    expect(result.size).toBe(0);
  });
});
