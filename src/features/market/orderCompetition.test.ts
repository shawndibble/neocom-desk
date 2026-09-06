import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import type { RegionOrder } from '@/esi/endpoints';
import { clearOrderBookCache } from './orderBook';
import {
  loadStationBestPrices,
  loadRegionCompetition,
  loadJumpsBetween,
  clearJumpsCache,
} from './orderCompetition';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearOrderBookCache();
  clearJumpsCache();
});
afterAll(() => server.close());

const STATION_A = 60003760;
const STATION_B = 60008494;
const REGION_ID = 10000002;
const TYPE_A = 34;
const TYPE_B = 35;

function aggregateBody(typeId: number) {
  return {
    [typeId]: {
      buy: { min: '2.5', max: '3.71', volume: '100', orderCount: '5' },
      sell: { min: '3.8', max: '38000.0', volume: '200', orderCount: '9' },
    },
  };
}

describe('loadStationBestPrices', () => {
  it('deduplicates type ids per station and makes one request per station', async () => {
    const requestsSeen: { station: string | null; types: string | null }[] = [];
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        const url = new URL(request.url);
        requestsSeen.push({
          station: url.searchParams.get('station'),
          types: url.searchParams.get('types'),
        });
        const station = url.searchParams.get('station');
        return HttpResponse.json(
          station === String(STATION_A)
            ? { ...aggregateBody(TYPE_A), ...aggregateBody(TYPE_B) }
            : aggregateBody(TYPE_A)
        );
      })
    );

    const result = await loadStationBestPrices([
      { stationId: STATION_A, typeIds: [TYPE_A, TYPE_B, TYPE_A] }, // duplicate TYPE_A
      { stationId: STATION_B, typeIds: [TYPE_A] },
    ]);

    expect(requestsSeen).toHaveLength(2);
    const stationARequest = requestsSeen.find((r) => r.station === String(STATION_A));
    expect(stationARequest?.types).toBe(`${TYPE_A},${TYPE_B}`);

    expect(result.get(`${STATION_A}:${TYPE_A}`)).toEqual({
      sellMin: 3.8,
      buyMax: 3.71,
      sellVolume: 200,
      buyVolume: 100,
    });
    expect(result.get(`${STATION_A}:${TYPE_B}`)).toBeDefined();
    expect(result.get(`${STATION_B}:${TYPE_A}`)).toBeDefined();
  });

  it('skips a station with no type ids entirely, making no request for it', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        const station = new URL(request.url).searchParams.get('station');
        if (station === String(STATION_B)) {
          throw new Error('must not request a station with no type ids');
        }
        return HttpResponse.json(aggregateBody(TYPE_A));
      })
    );

    const result = await loadStationBestPrices([
      { stationId: STATION_A, typeIds: [TYPE_A] },
      { stationId: STATION_B, typeIds: [] },
    ]);

    expect(result.has(`${STATION_A}:${TYPE_A}`)).toBe(true);
    expect(result.has(`${STATION_B}:${TYPE_A}`)).toBe(false);
  });

  it('caps in-flight station requests at ESI_FANOUT_CONCURRENCY rather than firing every station at once', async () => {
    const stationCount = ESI_FANOUT_CONCURRENCY + 5;
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return HttpResponse.json(aggregateBody(TYPE_A));
      })
    );

    const requests = Array.from({ length: stationCount }, (_, i) => ({
      stationId: STATION_A + i,
      typeIds: [TYPE_A],
    }));

    const result = await loadStationBestPrices(requests);

    expect(maxInFlight).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
    // Genuinely concurrent, not serialized down to one at a time.
    expect(maxInFlight).toBeGreaterThan(1);
    // Every station still gets fetched eventually, just fanned out in batches.
    expect(result.size).toBe(stationCount);
  });

  it('does not let one failing station empty the result for the others', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        const station = new URL(request.url).searchParams.get('station');
        if (station === String(STATION_B))
          return HttpResponse.json({ error: 'gone' }, { status: 500 });
        return HttpResponse.json(aggregateBody(TYPE_A));
      })
    );

    const result = await loadStationBestPrices([
      { stationId: STATION_A, typeIds: [TYPE_A] },
      { stationId: STATION_B, typeIds: [TYPE_A] },
    ]);

    expect(result.has(`${STATION_A}:${TYPE_A}`)).toBe(true);
    expect(result.has(`${STATION_B}:${TYPE_A}`)).toBe(false);
  });
});

function regionOrder(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    order_id: 1,
    type_id: TYPE_A,
    is_buy_order: false,
    issued: '2026-08-01T00:00:00Z',
    location_id: STATION_A,
    min_volume: 1,
    price: 5,
    range: 'region',
    system_id: 30000142,
    volume_remain: 100,
    volume_total: 100,
    duration: 90,
    ...overrides,
  };
}

describe('loadRegionCompetition', () => {
  it('maps the region order book, preserving location and system ids on both sides', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/orders`, () =>
        HttpResponse.json(
          [
            regionOrder({ order_id: 1, is_buy_order: false, location_id: STATION_A, system_id: 1 }),
            regionOrder({ order_id: 2, is_buy_order: true, location_id: STATION_B, system_id: 2 }),
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );

    const result = await loadRegionCompetition(REGION_ID, TYPE_A);

    expect(result.truncated).toBe(false);
    expect(result.competitors).toEqual([
      {
        orderId: 1,
        price: 5,
        locationId: STATION_A,
        systemId: 1,
        volumeRemain: 100,
        isBuyOrder: false,
      },
      {
        orderId: 2,
        price: 5,
        locationId: STATION_B,
        systemId: 2,
        volumeRemain: 100,
        isBuyOrder: true,
      },
    ]);
  });

  it('passes through truncation from the underlying order book', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/orders`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        return page === '1'
          ? HttpResponse.json([regionOrder()], { headers: { 'X-Pages': '2' } })
          : HttpResponse.json({ error: 'gone' }, { status: 404 });
      })
    );

    const result = await loadRegionCompetition(REGION_ID, TYPE_A);

    expect(result.truncated).toBe(true);
  });
});

const SYS_A = 30000142;
const SYS_B = 30002187;

describe('loadJumpsBetween', () => {
  it('is 0 jumps with no ESI call for the same origin and destination', async () => {
    const result = await loadJumpsBetween(SYS_A, SYS_A);
    expect(result).toEqual({ kind: 'known', jumps: 0 });
  });

  it('memoizes per ordered pair: only one ESI call for a repeated pair', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/${SYS_A}/${SYS_B}`, () => {
        hits += 1;
        return HttpResponse.json([SYS_A, SYS_B]);
      })
    );

    const first = await loadJumpsBetween(SYS_A, SYS_B);
    const second = await loadJumpsBetween(SYS_A, SYS_B);

    expect(first).toEqual({ kind: 'known', jumps: 1 });
    expect(second).toEqual({ kind: 'known', jumps: 1 });
    expect(hits).toBe(1);
  });

  it('degrades to unknown/noRoute on a failed route lookup, never throwing', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/${SYS_A}/${SYS_B}`, () => HttpResponse.error())
    );

    const result = await loadJumpsBetween(SYS_A, SYS_B);

    expect(result).toEqual({ kind: 'unknown', reason: 'noRoute' });
  });

  it('does not stick on a transient failure: a later call for the same pair retries', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/${SYS_A}/${SYS_B}`, () => {
        hits += 1;
        return hits === 1 ? HttpResponse.error() : HttpResponse.json([SYS_A, SYS_B]);
      })
    );

    const first = await loadJumpsBetween(SYS_A, SYS_B);
    const second = await loadJumpsBetween(SYS_A, SYS_B);

    expect(first).toEqual({ kind: 'unknown', reason: 'noRoute' });
    expect(second).toEqual({ kind: 'known', jumps: 1 });
    expect(hits).toBe(2);
  });
});
