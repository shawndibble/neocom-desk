import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { db } from '@/db';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { FUZZWORK_AGGREGATES_URL } from './fuzzwork';
import { DEFAULT_TRADE_HUB } from './hubs';
import {
  getHubPrices,
  getStationPrices,
  getAdjustedPrices,
  clearMarketPriceCache,
  invalidateHubPrices,
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

  it('re-fetches inside the TTL for type ids that were invalidated', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    const clock = () => 1_000_000;

    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(1);

    invalidateHubPrices(DEFAULT_TRADE_HUB.stationId, [34]);
    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(2);
  });

  it('leaves other stations’ cached prices alone when invalidating', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    const clock = () => 1_000_000;

    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(1);

    invalidateHubPrices(DEFAULT_TRADE_HUB.stationId + 1, [34]);
    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(1); // still cached
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

describe('getStationPrices', () => {
  // issue #1423: `marketOrderUndercutDomain` calls this directly with a bare
  // station (order location) id, sharing `getHubPrices`' cache rather than
  // paying an uncached Fuzzwork request per station per poll.
  it('shares the cache with getHubPrices — a second call inside the TTL makes no fetch', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    const first = await getStationPrices(DEFAULT_TRADE_HUB.stationId, [34], clock);
    expect(first.get(34)).toEqual({ sellMin: 3.8, buyMax: 3.71, sellVolume: 200, buyVolume: 100 });
    expect(hits.count).toBe(1);

    now += 1000; // well within TTL
    const second = await getStationPrices(DEFAULT_TRADE_HUB.stationId, [34], clock);
    expect(second.get(34)).toEqual(first.get(34));
    expect(hits.count).toBe(1); // served from cache, no second request

    // getHubPrices for the same station/type reads the very same cache entry.
    const viaHub = await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(viaHub.get(34)).toEqual(first.get(34));
    expect(hits.count).toBe(1);
  });

  it('a Fuzzwork failure returns null prices and caches nothing', async () => {
    let attempt = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        attempt += 1;
        return HttpResponse.error();
      })
    );
    let now = 1_000_000;
    const clock = () => now;

    const first = await getStationPrices(DEFAULT_TRADE_HUB.stationId, [34], clock);
    expect(first.get(34)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });
    expect(attempt).toBe(1);

    now += 1000; // well within TTL — nothing was cached, so this retries
    const second = await getStationPrices(DEFAULT_TRADE_HUB.stationId, [34], clock);
    expect(second.get(34)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });
    expect(attempt).toBe(2);
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

/** A fresh copy of this module, as on a page load: memory empty, Dexie kept. */
async function freshPricesModule(): Promise<typeof import('./prices')> {
  vi.resetModules();
  return import('./prices');
}

/** `freshPricesModule`, once the write behind the last fetch (never awaited by its caller) has landed. */
async function reloadPricesModule(): Promise<typeof import('./prices')> {
  await vi.waitFor(async () => expect(await db.esiCache.count()).toBeGreaterThan(0));
  return freshPricesModule();
}

describe('in-flight sharing', () => {
  it('concurrent callers for the same types share one Fuzzwork request', async () => {
    const hits = { count: 0 };
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, async () => {
        hits.count += 1;
        await delay(20);
        return HttpResponse.json({
          34: {
            buy: { min: '2.5', max: '3.71', volume: '100', orderCount: '1' },
            sell: { min: '3.8', max: '4.0', volume: '200', orderCount: '1' },
          },
        });
      })
    );
    const clock = () => 1_000_000;

    const [a, b] = await Promise.all([
      getHubPrices(DEFAULT_TRADE_HUB, [34], clock),
      getStationPrices(DEFAULT_TRADE_HUB.stationId, [34], clock),
    ]);

    expect(hits.count).toBe(1);
    expect(a.get(34)?.sellMin).toBe(3.8);
    expect(b.get(34)).toEqual(a.get(34));
  });

  it('an overlapping concurrent caller fetches only the types not already in flight', async () => {
    const requestedTypes: string[] = [];
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, async ({ request }) => {
        requestedTypes.push(new URL(request.url).searchParams.get('types') ?? '');
        await delay(20);
        return HttpResponse.json({});
      })
    );
    const clock = () => 1_000_000;

    await Promise.all([
      getHubPrices(DEFAULT_TRADE_HUB, [34], clock),
      getHubPrices(DEFAULT_TRADE_HUB, [34, 35], clock),
    ]);

    expect([...requestedTypes].sort()).toEqual(['34', '35']);
  });

  it('concurrent getAdjustedPrices callers share one ESI request', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/prices`, async () => {
        hits += 1;
        await delay(20);
        return HttpResponse.json([{ type_id: 34, adjusted_price: 5.5, average_price: 5.2 }]);
      })
    );
    const clock = () => 1_000_000;

    const [a, b] = await Promise.all([getAdjustedPrices(clock), getAdjustedPrices(clock)]);

    expect(hits).toBe(1);
    expect(a.get(34)).toEqual({ adjusted: 5.5, average: 5.2 });
    expect(b).toBe(a);
  });
});

describe('persistence across a reload', () => {
  it('hub prices fetched inside the TTL are read back after a reload, not refetched', async () => {
    await db.esiCache.clear();
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    let now = 1_000_000;
    const clock = () => now;

    const before = await (await freshPricesModule()).getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(1);

    now += HUB_PRICE_TTL_MS - 1;
    const after = await (await reloadPricesModule()).getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(after.get(34)).toEqual(before.get(34));
    expect(hits.count).toBe(1);

    now += 2; // past the TTL, measured from the original fetch
    await (await reloadPricesModule()).getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    expect(hits.count).toBe(2);
  });

  it('adjusted prices fetched inside the TTL are read back after a reload, not refetched', async () => {
    await db.esiCache.clear();
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/prices`, () => {
        hits += 1;
        return HttpResponse.json([{ type_id: 34, adjusted_price: 5.5, average_price: 5.2 }]);
      })
    );
    let now = 1_000_000;
    const clock = () => now;

    await (await freshPricesModule()).getAdjustedPrices(clock);
    expect(hits).toBe(1);

    now += ADJUSTED_PRICE_TTL_MS - 1;
    const after = await (await reloadPricesModule()).getAdjustedPrices(clock);
    expect(after.get(34)).toEqual({ adjusted: 5.5, average: 5.2 });
    expect(hits).toBe(1);

    now += 2;
    await (await reloadPricesModule()).getAdjustedPrices(clock);
    expect(hits).toBe(2);
  });

  it('a failed Fuzzwork fetch persists nothing', async () => {
    await db.esiCache.clear();
    server.use(http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.error()));

    await getHubPrices(DEFAULT_TRADE_HUB, [34], () => 1_000_000);

    expect(await db.esiCache.count()).toBe(0);
  });

  it('clearMarketPriceCache also stops persisted rows being served', async () => {
    const hits = { count: 0 };
    server.use(fuzzworkHandler(hits));
    const clock = () => 1_000_000;

    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);
    clearMarketPriceCache();
    await getHubPrices(DEFAULT_TRADE_HUB, [34], clock);

    expect(hits.count).toBe(2);
  });
});
