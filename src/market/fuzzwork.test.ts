import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { fetchAggregates, FUZZWORK_AGGREGATES_URL } from './fuzzwork';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchAggregates', () => {
  it('parses stringified sell/buy fields into numbers', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () =>
        HttpResponse.json({
          34: {
            buy: { min: '2.5', max: '3.71', volume: '7977648455.0', orderCount: '28' },
            sell: { min: '3.8', max: '38000.0', volume: '11285920154.0', orderCount: '44' },
          },
        })
      )
    );

    const result = await fetchAggregates(60003760, [34]);

    expect(result.get(34)).toEqual({
      sellMin: 3.8,
      buyMax: 3.71,
      sellVolume: 11285920154,
      buyVolume: 7977648455,
    });
  });

  it('sends station and comma-joined types as query params', async () => {
    let captured: URL | null = null;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        captured = new URL(request.url);
        return HttpResponse.json({});
      })
    );

    await fetchAggregates(60003760, [34, 35, 36]);

    const url = captured as URL | null;
    expect(url?.searchParams.get('station')).toBe('60003760');
    expect(url?.searchParams.get('types')).toBe('34,35,36');
  });

  it('chunks more than 200 type IDs into multiple requests', async () => {
    const requestedBatches: string[][] = [];
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
        const types = new URL(request.url).searchParams.get('types') ?? '';
        requestedBatches.push(types.split(','));
        return HttpResponse.json({});
      })
    );

    const typeIds = Array.from({ length: 450 }, (_, i) => i + 1);
    const result = await fetchAggregates(60003760, typeIds);

    expect(requestedBatches).toHaveLength(3);
    expect(requestedBatches[0]).toHaveLength(200);
    expect(requestedBatches[1]).toHaveLength(200);
    expect(requestedBatches[2]).toHaveLength(50);
    // Every requested type ID still gets an entry back.
    expect(result.size).toBe(450);
  });

  it('returns an empty map without any request when typeIds is empty', async () => {
    let requests = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        requests += 1;
        return HttpResponse.json({});
      })
    );

    const result = await fetchAggregates(60003760, []);

    expect(result.size).toBe(0);
    expect(requests).toBe(0);
  });

  it('reports null price (not 0) when a type is missing from the response', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () =>
        // 35 has no key at all in the response.
        HttpResponse.json({
          34: {
            buy: { min: '2.5', max: '3.71', volume: '100', orderCount: '1' },
            sell: { min: '3.8', max: '4.0', volume: '200', orderCount: '1' },
          },
        })
      )
    );

    const result = await fetchAggregates(60003760, [34, 35]);

    expect(result.get(35)).toEqual({ sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 });
    expect(result.get(34)?.sellMin).toBe(3.8);
  });

  it('reports null price (not 0) when a side has orderCount 0, even with a zero-filled body', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () =>
        HttpResponse.json({
          999999999: {
            buy: { min: 0, max: 0, volume: 0, orderCount: 0 },
            sell: { min: 0, max: 0, volume: 0, orderCount: 0 },
          },
        })
      )
    );

    const result = await fetchAggregates(60003760, [999999999]);

    expect(result.get(999999999)).toEqual({
      sellMin: null,
      buyMax: null,
      sellVolume: 0,
      buyVolume: 0,
    });
  });

  it('reports null price (not 0) when orderCount is positive but the price field is missing or NaN (BUG #5)', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () =>
        HttpResponse.json({
          34: {
            buy: { max: 'not-a-number', volume: '100', orderCount: '5' },
            sell: { volume: '200', orderCount: '3' }, // min field missing entirely
          },
        })
      )
    );

    const result = await fetchAggregates(60003760, [34]);

    expect(result.get(34)).toEqual({
      sellMin: null,
      buyMax: null,
      sellVolume: 200,
      buyVolume: 100,
    });
  });

  it('throws when the response is not ok', async () => {
    server.use(http.get(FUZZWORK_AGGREGATES_URL, () => new HttpResponse('boom', { status: 500 })));

    await expect(fetchAggregates(60003760, [34])).rejects.toThrow(/500/);
  });
});
