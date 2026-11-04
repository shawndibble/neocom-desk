import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadMarketOpenPrices,
  loadStoredOpenPrices,
  OPEN_PRICES_SHARD_COUNT,
  parseOpenPricesByType,
  openPricesShardUrl,
  openPricesUrl,
  resetMarketOpenPricesCache,
} from './marketOpenPrices';

const FORGE = 10000002;
const DOMAIN = 10000043;
const JITA = 60003760;
const AMARR = 60008494;
/** The station shape (#4279): series keyed by hub station id. */
const DOC = {
  typeId: 34,
  dates: ['2026-10-01', '2026-10-02'],
  stations: {
    [JITA]: { buy: [5, null], sell: [6, 7] },
    [AMARR]: { buy: [1, 2], sell: [3, 4] },
  },
};
const fetchMock = vi.fn();

/** Serves each URL's body; any other URL is an object R2 does not have (404). */
function serveFiles(files: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) =>
    url in files
      ? new Response(JSON.stringify(files[url]), { status: 200 })
      : new Response('missing', { status: 404 })
  );
}

/**
 * The per-type layout only (no shards yet): `data` for any type's own object;
 * `undefined` is an object R2 does not have (404).
 */
function serve(data: unknown) {
  fetchMock.mockImplementation(async (url: string) =>
    data === undefined || url.includes('/shards/')
      ? new Response('missing', { status: 404 })
      : new Response(JSON.stringify(data), { status: 200 })
  );
}

const urlsRead = () => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetMarketOpenPricesCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openPricesUrl', () => {
  it('is one static object per type', () => {
    expect(openPricesUrl(34)).toBe('https://data.neocomdesk.com/open-prices/34.json');
  });
});

describe('parseOpenPricesByType', () => {
  it('reads each hub station as a series over the shared dates', () => {
    const parsed = parseOpenPricesByType(DOC);
    expect(parsed?.stations.get(JITA)).toEqual({ dates: DOC.dates, buy: [5, null], sell: [6, 7] });
    expect(parsed?.stations.get(AMARR)?.buy).toEqual([1, 2]);
  });

  it('skips a malformed series and rejects anything not shaped like a type object', () => {
    expect(
      parseOpenPricesByType({ ...DOC, stations: { ...DOC.stations, 1: { buy: ['x'], sell: [] } } })
        ?.stations.size
    ).toBe(2);
    expect(parseOpenPricesByType(undefined)).toBeNull();
    expect(parseOpenPricesByType({ dates: [], stations: {} })).toBeNull();
    expect(parseOpenPricesByType({ dates: ['2026-10-01'] })).toBeNull();
  });
});

describe('loadMarketOpenPrices', () => {
  it("serves a hub region its station's series, named by station id", async () => {
    serve(DOC);
    const [forge, domain, other] = await Promise.all([
      loadMarketOpenPrices(FORGE, 34),
      loadMarketOpenPrices(DOMAIN, 34),
      loadMarketOpenPrices(10000001, 34),
    ]);
    expect(forge).toEqual({
      stationId: JITA,
      series: { dates: DOC.dates, buy: [5, null], sell: [6, 7] },
    });
    expect(domain?.stationId).toBe(AMARR);
    expect(domain?.series.buy).toEqual([1, 2]);
    // A compared non-hub region simply has no open series.
    expect(other).toBeNull();
    expect(urlsRead()).toEqual([openPricesShardUrl(34), openPricesUrl(34)]);
  });

  it('holds the answer, a missing object included, so a reopen reads nothing', async () => {
    serve(undefined);
    expect(await loadMarketOpenPrices(1, 2, 1000)).toBeNull();
    expect(await loadMarketOpenPrices(3, 2, 2000)).toBeNull();
    expect(urlsRead()).toEqual([openPricesShardUrl(2), openPricesUrl(2)]);
  });

  it('reads again once the hold lapses', async () => {
    serve(DOC);
    await loadMarketOpenPrices(FORGE, 2, 0);
    await loadMarketOpenPrices(FORGE, 2, 2 * 60 * 60_000);
    expect(urlsRead().filter((url) => url === openPricesUrl(2))).toHaveLength(2);
  });

  it('is null, never a rejection, on a server error, and tries again next time', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect(await loadMarketOpenPrices(FORGE, 2)).toBeNull();
    serve(DOC);
    expect((await loadMarketOpenPrices(FORGE, 2))?.series.buy).toEqual([5, null]);
  });

  it('is null on a failed read (offline) and tries again next time', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await loadMarketOpenPrices(FORGE, 2)).toBeNull();
    serve(DOC);
    expect((await loadMarketOpenPrices(FORGE, 2))?.series.buy).toEqual([5, null]);
  });
});

describe('the sharded layout', () => {
  const SIBLING = 34 + OPEN_PRICES_SHARD_COUNT;

  it('names a shard by the type id modulo the shard count', () => {
    expect(openPricesShardUrl(34)).toBe('https://data.neocomdesk.com/open-prices/shards/34.json');
    expect(openPricesShardUrl(SIBLING)).toBe(openPricesShardUrl(34));
  });

  it("reads a type out of its shard, never the type's own object", async () => {
    serveFiles({ [openPricesShardUrl(34)]: { types: { 34: DOC } } });
    expect((await loadMarketOpenPrices(FORGE, 34))?.series.sell).toEqual([6, 7]);
    expect(urlsRead()).toEqual([openPricesShardUrl(34)]);
  });

  it('reads a shard once for every type it holds, at once or later', async () => {
    const later = 34 + 2 * OPEN_PRICES_SHARD_COUNT;
    serveFiles({
      [openPricesShardUrl(34)]: {
        types: { 34: DOC, [SIBLING]: { ...DOC, typeId: SIBLING }, [later]: DOC },
      },
    });
    const [a, b] = await Promise.all([loadStoredOpenPrices(34), loadStoredOpenPrices(SIBLING)]);
    expect(a?.stations.size).toBe(2);
    expect(b?.stations.size).toBe(2);
    expect((await loadStoredOpenPrices(later))?.stations.size).toBe(2);
    expect(urlsRead()).toEqual([openPricesShardUrl(34)]);
  });

  it("falls back to the type's own object when its shard does not hold it", async () => {
    // A type with no hub price since the move: its history is only in the old object.
    serveFiles({ [openPricesShardUrl(34)]: { types: {} }, [openPricesUrl(34)]: DOC });
    expect((await loadMarketOpenPrices(FORGE, 34))?.stationId).toBe(JITA);
    expect(urlsRead()).toEqual([openPricesShardUrl(34), openPricesUrl(34)]);
  });

  it('is null for a shard not shaped like one, and tries again next time', async () => {
    serveFiles({ [openPricesShardUrl(34)]: ['nope'] });
    expect(await loadMarketOpenPrices(FORGE, 34)).toBeNull();
    serveFiles({ [openPricesShardUrl(34)]: { types: { 34: DOC } } });
    expect((await loadMarketOpenPrices(FORGE, 34))?.stationId).toBe(JITA);
  });
});
