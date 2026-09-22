import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrderBook, type OrderBookResult } from './orderBook';
import {
  buildOrderBookView,
  clearOrderBookViewCache,
  fetchOrderBook,
  loadGlobalMarketOverrides,
  loadOrderBookView,
  orderBookLocationFor,
  type OrderBookLocation,
} from './orderBookView';
import { loadGlobalMarkets } from '@/sde/loadMarketSde';
import type { RegionOrder } from '@/esi/endpoints';

vi.mock('./orderBook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orderBook')>()),
  getOrderBook: vi.fn(),
  clearOrderBookCache: vi.fn(),
}));

vi.mock('@/sde/loadMarketSde', () => ({ loadGlobalMarkets: vi.fn() }));

const mockedGetOrderBook = vi.mocked(getOrderBook);

const THE_FORGE = 10000002;
const JITA_4_4 = 60003760;
const PERIMETER_STATION = 60000004;
const PLEX = 44992;
const PLEX_REGION = 19000001;
const TRITANIUM = 34;

const regionLocation: OrderBookLocation = {
  mode: 'region',
  regionId: THE_FORGE,
  hubStationId: JITA_4_4,
  globalMarkets: new Map(),
};
const hubLocation: OrderBookLocation = { ...regionLocation, mode: 'hub' };

function order(overrides: Partial<RegionOrder>): RegionOrder {
  return {
    order_id: 1,
    type_id: TRITANIUM,
    is_buy_order: false,
    price: 0,
    location_id: JITA_4_4,
    system_id: 30000142,
    volume_remain: 1,
    volume_total: 1,
    min_volume: 1,
    duration: 90,
    issued: '2026-08-01T00:00:00Z',
    range: 'region',
    ...overrides,
  };
}

function book(orders: RegionOrder[], extra: Partial<OrderBookResult> = {}): OrderBookResult {
  return { orders, truncated: false, fetchedAt: 1234, ...extra };
}

const MIXED = [
  order({ order_id: 1, price: 6, location_id: JITA_4_4, volume_remain: 10 }),
  order({ order_id: 2, price: 4, location_id: PERIMETER_STATION, volume_remain: 5 }),
  order({ order_id: 3, price: 5, location_id: JITA_4_4, volume_remain: 20 }),
  order({ order_id: 4, is_buy_order: true, price: 3, location_id: JITA_4_4 }),
  order({ order_id: 5, is_buy_order: true, price: 3.5, location_id: PERIMETER_STATION }),
  order({ order_id: 6, is_buy_order: true, price: 3.2, location_id: JITA_4_4 }),
];

beforeEach(() => {
  mockedGetOrderBook.mockReset();
});

describe('loadOrderBookView', () => {
  it('Region mode keeps every station in the region, sorted best-first per side', async () => {
    mockedGetOrderBook.mockResolvedValue(book(MIXED));

    const view = await loadOrderBookView(TRITANIUM, regionLocation);

    expect(mockedGetOrderBook).toHaveBeenCalledWith(THE_FORGE, TRITANIUM);
    expect(view.status).toBe('ready');
    if (view.status === 'failed') throw new Error('unreachable');
    expect(view.sell.map((o) => o.order_id)).toEqual([2, 3, 1]);
    expect(view.buy.map((o) => o.order_id)).toEqual([5, 6, 4]);
    expect(view.summary).toEqual({ bestSell: 4, bestBuy: 3.5, spread: 0.5, availableVolume: 35 });
    expect(view.fetchedAt).toBe(1234);
  });

  it("Trade Hub mode narrows the region to the hub's own station", async () => {
    mockedGetOrderBook.mockResolvedValue(book(MIXED));

    const view = await loadOrderBookView(TRITANIUM, hubLocation);

    if (view.status === 'failed') throw new Error('expected a loaded view');
    expect(view.sell.map((o) => o.order_id)).toEqual([3, 1]);
    expect(view.buy.map((o) => o.order_id)).toEqual([6, 4]);
    expect(view.summary).toEqual({
      bestSell: 5,
      bestBuy: 3.2,
      spread: 5 - 3.2,
      availableVolume: 30,
    });
  });

  it('reads a Global Market Region item from its own region, still filtered to the hub station', async () => {
    mockedGetOrderBook.mockResolvedValue(
      book([
        order({ type_id: PLEX, order_id: 1, price: 5_000_000, location_id: JITA_4_4 }),
        order({ type_id: PLEX, order_id: 2, price: 4_000_000, location_id: PERIMETER_STATION }),
      ])
    );
    const location: OrderBookLocation = {
      ...hubLocation,
      globalMarkets: new Map([[PLEX, { regionId: PLEX_REGION, regionName: 'PLEX Market' }]]),
    };

    const view = await loadOrderBookView(PLEX, location);

    expect(mockedGetOrderBook).toHaveBeenCalledWith(PLEX_REGION, PLEX);
    expect(view.region).toEqual({
      regionId: PLEX_REGION,
      override: { regionId: PLEX_REGION, regionName: 'PLEX Market' },
    });
    if (view.status === 'failed') throw new Error('expected a loaded view');
    expect(view.sell.map((o) => o.order_id)).toEqual([1]);
  });

  it('reports a failed fetch as failed, never as an empty book', async () => {
    mockedGetOrderBook.mockRejectedValue(new Error('ESI 420'));

    const view = await loadOrderBookView(TRITANIUM, regionLocation);

    expect(view.status).toBe('failed');
    expect(view.region.regionId).toBe(THE_FORGE);
    expect(view).not.toHaveProperty('sell');
  });

  it('reports a book with no orders at the location as empty, with an all-null summary', async () => {
    mockedGetOrderBook.mockResolvedValue(
      book([order({ order_id: 1, price: 4, location_id: PERIMETER_STATION })])
    );

    const view = await loadOrderBookView(TRITANIUM, hubLocation);

    expect(view.status).toBe('empty');
    if (view.status === 'failed') throw new Error('expected a loaded view');
    expect(view.sell).toEqual([]);
    expect(view.buy).toEqual([]);
    expect(view.summary).toEqual({
      bestSell: null,
      bestBuy: null,
      spread: null,
      availableVolume: 0,
    });
  });

  it('applies the station filter on top of the Location Mode', async () => {
    mockedGetOrderBook.mockResolvedValue(book(MIXED));

    const view = await loadOrderBookView(TRITANIUM, {
      ...regionLocation,
      stationFilter: PERIMETER_STATION,
    });

    if (view.status === 'failed') throw new Error('expected a loaded view');
    expect(view.sell.map((o) => o.order_id)).toEqual([2]);
    expect(view.buy.map((o) => o.order_id)).toEqual([5]);
    expect(view.summary.bestSell).toBe(4);
  });

  it('carries the truncated flag through', async () => {
    mockedGetOrderBook.mockResolvedValue(book(MIXED, { truncated: true }));

    const view = await loadOrderBookView(TRITANIUM, regionLocation);

    if (view.status === 'failed') throw new Error('expected a loaded view');
    expect(view.truncated).toBe(true);
  });
});

describe('fetchOrderBook + buildOrderBookView', () => {
  it('lets a caller re-derive the view under a new station filter without fetching again', async () => {
    mockedGetOrderBook.mockResolvedValue(book(MIXED));

    const fetched = await fetchOrderBook(TRITANIUM, regionLocation);
    const whole = buildOrderBookView(TRITANIUM, regionLocation, fetched);
    const narrowed = buildOrderBookView(
      TRITANIUM,
      { ...regionLocation, stationFilter: JITA_4_4 },
      fetched
    );

    expect(mockedGetOrderBook).toHaveBeenCalledTimes(1);
    if (whole.status === 'failed' || narrowed.status === 'failed') throw new Error('unreachable');
    expect(whole.sell).toHaveLength(3);
    expect(narrowed.sell.map((o) => o.order_id)).toEqual([3, 1]);
  });

  it('fetchOrderBook never rejects', async () => {
    mockedGetOrderBook.mockRejectedValue(new Error('budget refused'));

    await expect(fetchOrderBook(TRITANIUM, regionLocation)).resolves.toMatchObject({
      status: 'failed',
    });
  });
});

describe('clearOrderBookViewCache', () => {
  it('clears the cache entry for the region the location actually resolves to', async () => {
    const { clearOrderBookCache } = await import('./orderBook');
    clearOrderBookViewCache(PLEX, {
      ...hubLocation,
      globalMarkets: new Map([[PLEX, { regionId: PLEX_REGION, regionName: 'PLEX Market' }]]),
    });
    expect(vi.mocked(clearOrderBookCache)).toHaveBeenCalledWith(PLEX_REGION, PLEX);
  });
});

describe('orderBookLocationFor', () => {
  const jita = { regionId: THE_FORGE, stationId: JITA_4_4 };
  const globalMarkets = new Map([[PLEX, { regionId: PLEX_REGION, regionName: 'PLEX Market' }]]);

  it("Trade Hub mode reads the hub's region and station", () => {
    expect(orderBookLocationFor('hub', 10000043, jita, globalMarkets)).toEqual({
      mode: 'hub',
      regionId: THE_FORGE,
      hubStationId: JITA_4_4,
      globalMarkets,
    });
  });

  it("Region mode reads the picked region, falling back to the hub's until one is picked", () => {
    expect(orderBookLocationFor('region', 10000043, jita, globalMarkets).regionId).toBe(10000043);
    expect(orderBookLocationFor('region', null, jita, globalMarkets).regionId).toBe(THE_FORGE);
  });
});

describe('loadGlobalMarketOverrides', () => {
  it('reshapes globalMarkets.json into a typeId lookup', async () => {
    vi.mocked(loadGlobalMarkets).mockResolvedValueOnce([
      { typeId: PLEX, regionId: PLEX_REGION, regionName: 'PLEX Market' },
    ]);
    const map = await loadGlobalMarketOverrides();
    expect(map.get(PLEX)).toEqual({ regionId: PLEX_REGION, regionName: 'PLEX Market' });
  });

  it('degrades to no overrides on failure, never rejecting', async () => {
    vi.mocked(loadGlobalMarkets).mockRejectedValueOnce(new Error('network error'));
    await expect(loadGlobalMarketOverrides()).resolves.toEqual(new Map());
  });
});
