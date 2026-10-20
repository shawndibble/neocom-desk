import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadMarketOpenPrices,
  parseOpenPricesByType,
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

/** Serves `data` for any type; `undefined` is an object R2 does not have (404). */
function serve(data: unknown) {
  fetchMock.mockImplementation(async () =>
    data === undefined
      ? new Response('missing', { status: 404 })
      : new Response(JSON.stringify(data), { status: 200 })
  );
}

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
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([openPricesUrl(34)]);
  });

  it('holds the answer, a missing object included, so a reopen reads nothing', async () => {
    serve(undefined);
    expect(await loadMarketOpenPrices(1, 2, 1000)).toBeNull();
    expect(await loadMarketOpenPrices(3, 2, 2000)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads again once the hold lapses', async () => {
    serve(DOC);
    await loadMarketOpenPrices(FORGE, 2, 0);
    await loadMarketOpenPrices(FORGE, 2, 2 * 60 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
