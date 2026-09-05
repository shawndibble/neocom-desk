import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { clearMarketPriceCache } from '@/market/prices';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadMarketSnapshot, clearCostIndexCache } from './marketData';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearCostIndexCache();
});
afterAll(() => server.close());

function fuzzworkHandler() {
  return http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
    const types = new URL(request.url).searchParams.get('types')?.split(',') ?? [];
    const body: Record<string, unknown> = {};
    for (const t of types) {
      if (t === '34') {
        body[t] = {
          sell: { min: '5.5', volume: '100', orderCount: '2' },
          buy: { max: '4.8', volume: '80', orderCount: '3' },
        };
      } else {
        body[t] = { sell: { orderCount: '0' }, buy: { orderCount: '0' } }; // no orders -> unpriceable
      }
    }
    return HttpResponse.json(body);
  });
}

function adjustedPricesHandler() {
  return http.get(`${ESI_BASE_URL}/markets/prices`, () =>
    HttpResponse.json([{ type_id: 34, adjusted_price: 4.2, average_price: 4.5 }])
  );
}

/** Two systems: the hub's, and Badivefi standing in for a build system elsewhere. */
const BUILD_SYSTEM_ID = 30003888;

function costIndexHandler() {
  return http.get(`${ESI_BASE_URL}/industry/systems`, () =>
    HttpResponse.json([
      {
        solar_system_id: DEFAULT_TRADE_HUB.systemId,
        cost_indices: [{ activity: 'manufacturing', cost_index: 0.0464 }],
      },
      {
        solar_system_id: BUILD_SYSTEM_ID,
        cost_indices: [{ activity: 'manufacturing', cost_index: 0.0272 }],
      },
    ])
  );
}

describe('loadMarketSnapshot', () => {
  it('assembles hub prices (unpriced types omitted), adjusted prices, and the hub system cost index', async () => {
    server.use(fuzzworkHandler(), adjustedPricesHandler(), costIndexHandler());

    const snapshot = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34, 587]);

    expect(snapshot.hubPrices).toEqual({ 34: 5.5 });
    expect(snapshot.hubPrices[587]).toBeUndefined();
    expect(snapshot.hubBuyPrices).toEqual({ 34: 4.8 });
    expect(snapshot.hubBuyPrices[587]).toBeUndefined();
    expect(snapshot.adjustedPrices).toEqual({ 34: 4.2 });
    expect(snapshot.systemCostIndex).toBe(0.0464);
  });

  it("reads the cost index of the build system when one is named, not the hub's", async () => {
    server.use(fuzzworkHandler(), adjustedPricesHandler(), costIndexHandler());

    const snapshot = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34], BUILD_SYSTEM_ID);

    // The hub is still priced at the hub; only the job fee moves system.
    expect(snapshot.hubPrices).toEqual({ 34: 5.5 });
    expect(snapshot.systemCostIndex).toBe(0.0272);
  });

  it('reports a null cost index for a build system with no industry index', async () => {
    server.use(fuzzworkHandler(), adjustedPricesHandler(), costIndexHandler());

    const snapshot = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34], 30000001);

    expect(snapshot.systemCostIndex).toBeNull();
  });

  it('reports adjustedPrices and systemCostIndex as null when the ESI calls fail (offline signal)', async () => {
    server.use(
      fuzzworkHandler(),
      http.get(`${ESI_BASE_URL}/markets/prices`, () => HttpResponse.error()),
      http.get(`${ESI_BASE_URL}/industry/systems`, () => HttpResponse.error())
    );

    const snapshot = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34]);

    expect(snapshot.hubPrices).toEqual({ 34: 5.5 });
    expect(snapshot.adjustedPrices).toBeNull();
    expect(snapshot.systemCostIndex).toBeNull();
  });

  it('caches the cost index across calls within the TTL, refetching only after clearing', async () => {
    let hits = 0;
    server.use(
      fuzzworkHandler(),
      adjustedPricesHandler(),
      http.get(`${ESI_BASE_URL}/industry/systems`, () => {
        hits += 1;
        return HttpResponse.json([
          {
            solar_system_id: DEFAULT_TRADE_HUB.systemId,
            cost_indices: [{ activity: 'manufacturing', cost_index: 0.01 }],
          },
        ]);
      })
    );

    await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34]);
    await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34]);
    expect(hits).toBe(1);

    clearCostIndexCache();
    await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34]);
    expect(hits).toBe(2);
  });

  it('reads the reaction cost index instead of manufacturing when asked, from one shared fetch (issue #460)', async () => {
    let hits = 0;
    server.use(
      fuzzworkHandler(),
      adjustedPricesHandler(),
      http.get(`${ESI_BASE_URL}/industry/systems`, () => {
        hits += 1;
        return HttpResponse.json([
          {
            solar_system_id: DEFAULT_TRADE_HUB.systemId,
            cost_indices: [
              { activity: 'manufacturing', cost_index: 0.0464 },
              { activity: 'reaction', cost_index: 0.0055 },
            ],
          },
        ]);
      })
    );

    const manufacturing = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34]);
    const reaction = await loadMarketSnapshot(DEFAULT_TRADE_HUB, [34], undefined, 'reaction');

    expect(manufacturing.systemCostIndex).toBe(0.0464);
    expect(reaction.systemCostIndex).toBe(0.0055);
    // One fetch serves both activities — ESI already returns every
    // activity's index per system in the one response.
    expect(hits).toBe(1);
  });
});
