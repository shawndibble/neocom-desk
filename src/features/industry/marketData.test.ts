import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { clearMarketPriceCache } from '@/market/prices';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { loadMarketSnapshot, loadMarketSnapshots, clearCostIndexCache } from './marketData';

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

describe('loadMarketSnapshots', () => {
  /** Prices every requested type deterministically, so filtering is observable. */
  function pricedFuzzworkHandler(record: { station: string; types: string[] }[]) {
    return http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const types = params.get('types')?.split(',') ?? [];
      record.push({ station: params.get('station') ?? '', types });
      const body: Record<string, unknown> = {};
      for (const t of types) {
        body[t] = {
          sell: { min: t, volume: '100', orderCount: '2' },
          buy: { max: String(Number(t) / 2), volume: '80', orderCount: '3' },
        };
      }
      return HttpResponse.json(body);
    });
  }

  it('issues one hub-price fetch for every request sharing a hub, over the unioned type ids', async () => {
    const calls: { station: string; types: string[] }[] = [];
    server.use(pricedFuzzworkHandler(calls), adjustedPricesHandler(), costIndexHandler());

    const snapshots = await Promise.all(
      loadMarketSnapshots([
        { hub: DEFAULT_TRADE_HUB, typeIds: [34, 587] },
        { hub: DEFAULT_TRADE_HUB, typeIds: [34, 588] },
        { hub: DEFAULT_TRADE_HUB, typeIds: [34] },
      ])
    );

    expect(calls).toHaveLength(1);
    expect([...(calls[0]?.types ?? [])].sort()).toEqual(['34', '587', '588']);

    // Each request still sees only its own type ids, not the union's.
    expect(snapshots[0]?.hubPrices).toEqual({ 34: 34, 587: 587 });
    expect(snapshots[1]?.hubPrices).toEqual({ 34: 34, 588: 588 });
    expect(snapshots[2]?.hubPrices).toEqual({ 34: 34 });
    expect(snapshots[2]?.hubBuyPrices).toEqual({ 34: 17 });
  });

  it('fetches once per distinct hub, not once per request', async () => {
    const calls: { station: string; types: string[] }[] = [];
    server.use(pricedFuzzworkHandler(calls), adjustedPricesHandler(), costIndexHandler());
    const amarr = getTradeHub('amarr');
    if (!amarr) throw new Error('amarr hub missing');

    await Promise.all(
      loadMarketSnapshots([
        { hub: DEFAULT_TRADE_HUB, typeIds: [34] },
        { hub: amarr, typeIds: [35] },
        { hub: DEFAULT_TRADE_HUB, typeIds: [36] },
        { hub: amarr, typeIds: [37] },
      ])
    );

    expect(calls).toHaveLength(2);
    const byStation = new Map(calls.map((c) => [c.station, [...c.types].sort()]));
    expect(byStation.get(String(DEFAULT_TRADE_HUB.stationId))).toEqual(['34', '36']);
    expect(byStation.get(String(amarr.stationId))).toEqual(['35', '37']);
  });

  it('fetches adjusted prices once for the whole batch', async () => {
    let hits = 0;
    server.use(
      pricedFuzzworkHandler([]),
      http.get(`${ESI_BASE_URL}/markets/prices`, () => {
        hits += 1;
        return HttpResponse.json([{ type_id: 34, adjusted_price: 4.2, average_price: 4.5 }]);
      }),
      costIndexHandler()
    );

    const snapshots = await Promise.all(
      loadMarketSnapshots(
        Array.from({ length: 5 }, () => ({ hub: DEFAULT_TRADE_HUB, typeIds: [34] }))
      )
    );

    expect(hits).toBe(1);
    expect(snapshots.every((s) => s.adjustedPrices?.[34] === 4.2)).toBe(true);
  });

  it('gives each request its own build system and activity from one shared cost-index fetch', async () => {
    let hits = 0;
    server.use(
      pricedFuzzworkHandler([]),
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
          {
            solar_system_id: BUILD_SYSTEM_ID,
            cost_indices: [{ activity: 'manufacturing', cost_index: 0.0272 }],
          },
        ]);
      })
    );

    const [hubIndex, buildSystem, reaction] = await Promise.all(
      loadMarketSnapshots([
        { hub: DEFAULT_TRADE_HUB, typeIds: [34] },
        { hub: DEFAULT_TRADE_HUB, typeIds: [34], costIndexSystemId: BUILD_SYSTEM_ID },
        { hub: DEFAULT_TRADE_HUB, typeIds: [34], activity: 'reaction' },
      ])
    );

    expect(hubIndex?.systemCostIndex).toBe(0.0464);
    expect(buildSystem?.systemCostIndex).toBe(0.0272);
    expect(reaction?.systemCostIndex).toBe(0.0055);
    // Two activities in one batch, still one fetch — the cost-index cache is
    // warmed before the second activity reads it, not raced against it.
    expect(hits).toBe(1);
  });

  it('returns nothing and fetches nothing for an empty request list', async () => {
    // No msw handlers registered: `onUnhandledRequest: 'error'` makes any
    // fetch here a failure.
    expect(await Promise.all(loadMarketSnapshots([]))).toEqual([]);
  });
});
