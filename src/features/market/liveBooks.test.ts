import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import {
  LIVE_BOOK_TTL_MS,
  clearLiveBooks,
  getLiveBook,
  loadLiveBooks,
  peekLiveBook,
} from './liveBooks';

const getMarketOrders = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ getMarketOrders }));

const jita = DEFAULT_TRADE_HUB;
const order = (order_id: number, location_id: number, price: number) => ({
  order_id,
  location_id,
  price,
  is_buy_order: false,
  duration: 90,
  issued: '',
  min_volume: 1,
  range: 'region',
  system_id: 1,
  type_id: 34,
  volume_remain: 1,
  volume_total: 1,
});

beforeEach(() => {
  clearLiveBooks();
  getMarketOrders.mockReset();
  getMarketOrders.mockResolvedValue({
    items: [order(1, jita.stationId, 5), order(2, 99, 4)],
    truncated: false,
  });
});

describe('getLiveBook', () => {
  it('keeps only the hub station orders', async () => {
    const book = await getLiveBook({ hub: jita, typeId: 34 });
    expect(book.orders.map((o) => o.order_id)).toEqual([1]);
    expect(getMarketOrders).toHaveBeenCalledWith(jita.regionId, 34);
  });

  it('reuses a book for ten minutes with no new request', async () => {
    let now = 1_000;
    await getLiveBook({ hub: jita, typeId: 34 }, { now: () => now });
    now += LIVE_BOOK_TTL_MS - 1;
    await getLiveBook({ hub: jita, typeId: 34 }, { now: () => now });
    expect(getMarketOrders).toHaveBeenCalledTimes(1);
    now += 2;
    await getLiveBook({ hub: jita, typeId: 34 }, { now: () => now });
    expect(getMarketOrders).toHaveBeenCalledTimes(2);
  });

  it('refetches on force whatever the age', async () => {
    await getLiveBook({ hub: jita, typeId: 34 });
    await getLiveBook({ hub: jita, typeId: 34 }, { force: true });
    expect(getMarketOrders).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    await Promise.all([
      getLiveBook({ hub: jita, typeId: 34 }),
      getLiveBook({ hub: jita, typeId: 34 }),
    ]);
    expect(getMarketOrders).toHaveBeenCalledTimes(1);
  });

  it('rejects a truncated book rather than quoting a partial best price', async () => {
    getMarketOrders.mockResolvedValue({ items: [], truncated: true });
    await expect(getLiveBook({ hub: jita, typeId: 34 })).rejects.toThrow();
    expect(peekLiveBook({ hub: jita, typeId: 34 })).toBeUndefined();
  });
});

describe('loadLiveBooks', () => {
  it('settles a failed row as failed and still loads the others', async () => {
    getMarketOrders.mockImplementation(async (_region: number, typeId: number) => {
      if (typeId === 2) throw new Error('boom');
      return { items: [order(typeId, jita.stationId, 5)], truncated: false };
    });
    const seen = new Map<number, string>();
    await loadLiveBooks(
      [1, 2, 3].map((typeId) => ({ hub: jita, typeId })),
      (request, result) => seen.set(request.typeId, result === 'failed' ? 'failed' : 'ok')
    );
    expect([...seen]).toEqual(
      expect.arrayContaining([
        [1, 'ok'],
        [2, 'failed'],
        [3, 'ok'],
      ])
    );
  });
});
