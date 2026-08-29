import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { FUZZWORK_AGGREGATES_URL } from './fuzzwork';
import { DEFAULT_TRADE_HUB } from './hubs';
import {
  getHubPrices,
  getAdjustedPrices,
  clearMarketPriceCache,
  HUB_PRICE_TTL_MS,
  ADJUSTED_PRICE_TTL_MS,
} from './prices';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
});
afterAll(() => server.close());

function fuzzworkHandler(hits: { count: number }) {
  return http.get(FUZZWORK_AGGREGATES_URL, () => {
    hits.count += 1;
    return HttpResponse.json({
      34: {
        buy: { min: '2.5', max: '3.71', volume: '100', orderCount: '1' },
        sell: { min: '3.8', max: '4.0', volume: '200', orderCount: '1' },
      },
    });
  });
}

describe('getHubPrices', () => {
  it('fetches from Fuzzwork and caches the result', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    const first = await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(first.get(34)).toEqual({ sellMin: 3.8, buyMax: 3.71, sellVolume: 200, buyVolume: 100 });
    expect(hits.count).toBe(1);

    now += 1000; // well within TTL
    const second = await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(second.get(34)).toEqual(first.get(34));
    expect(hits.count).toBe(1); // served from cache, no second request
  });

  it('re-fetches once the 15-minute TTL has elapsed', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(1);

    now += HUB_PRICE_TTL_MS + 1;
    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(2);
  });

  it('falls back to null prices per type when Fuzzwork is unreachable', async () => {
    server.use(http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.error()));

    const result = await getHubPrices(DEFAULT_TRADE_HUB, [34, 35]);

    expect(result.get(34)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });
    expect(result.get(35)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });
  });

  it('does not cache a failed fetch, so a retry well within the TTL tries Fuzzwork again', async () => {
    let attempt = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        attempt += 1;
        if (attempt === 1) return HttpResponse.error();
        return HttpResponse.json({
          34: {
            buy: { min: '2.5', max: '3.71', volume: '100', orderCount: '1' },
            sell: { min: '3.8', max: '4.0', volume: '200', orderCount: '1' },
          },
        });
      })
    );
    let now = 1_000_000;
    const clock = () => now;

    const failed = await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(failed.get(34)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });

    now += 1000; // well inside HUB_PRICE_TTL_MS
    const retried = await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);

    expect(attempt).toBe(2);
    expect(retried.get(34)).toEqual({
      sellMin: 3.8,
      buyMax: 3.71,
      sellVolume: 200,
      buyVolume: 100,
    });
  });

  it('only re-fetches the types missing from cache', async () => {
    const requestedTypes: string[] = [];
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        const types = new URL(request.url).searchParams.get('types') ?? '';
        requestedTypes.push(types);
        return HttpResponse.json({
          34: {
            buy: { min: '1', max: '1', volume: '1', orderCount: '1' },
            sell: { min: '1', max: '1', volume: '1', orderCount: '1' },
          },
          35: {
            buy: { min: '1', max: '1', volume: '1', orderCount: '1' },
            sell: { min: '1', max: '1', volume: '1', orderCount: '1' },
          },
        });
      })
    );
    let now = 1_000_000;
    const clock = () => now;

    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    now += 1000;
    await getHubPrices(DEFAULT_TRADE_HUB, [34, 35], clock);

    expect(requestedTypes).toEqual(['34', '35']);
  });
});

describe('getAdjustedPrices', () => {
  it('fetches from ESI and caches for an hour', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/prices`, () => {
        hits += 1;
        return HttpResponse.json([{ type_id: 34, adjusted_price: 5.5, average_price: 5.2 }]);
      })
    );
    let now = 1_000_000;
    const clock = () => now;

    const first = await getAdjustedPrices(clock);
    expect(first.get(34)).toEqual({ adjusted: 5.5, average: 5.2 });
    expect(hits).toBe(1);

    now += ADJUSTED_PRICE_TTL_MS - 1;
    await getAdjustedPrices(clock);
    expect(hits).toBe(1);

    now += 2;
    await getAdjustedPrices(clock);
    expect(hits).toBe(2);
  });
});
