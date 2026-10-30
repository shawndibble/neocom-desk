import { describe, it, expect } from 'vitest';
import { applyLiveBooks, liveStationBook, type LiveOrder } from '@/engine/market/liveBook';
import { appraisalUndercut, type AppraisalItem } from '@/engine/market/appraisal';

const HUB = 60003760;
const sell = (order_id: number, price: number, location_id = HUB): LiveOrder => ({
  order_id,
  price,
  location_id,
  is_buy_order: false,
});
const buy = (order_id: number, price: number, location_id = HUB): LiveOrder => ({
  order_id,
  price,
  location_id,
  is_buy_order: true,
});

describe('liveStationBook', () => {
  it('takes the cheapest sell and richest buy at the station only', () => {
    const book = liveStationBook(
      [
        sell(1, 105),
        sell(2, 100),
        sell(3, 90, 60008494),
        buy(4, 80),
        buy(5, 85),
        buy(6, 99, 60008494),
      ],
      HUB,
      new Set()
    );
    expect(book).toEqual({ sell: 100, buy: 85, sellIsOwn: false });
  });

  it('is null on a side with no orders', () => {
    expect(liveStationBook([], HUB, new Set())).toEqual({
      sell: null,
      buy: null,
      sellIsOwn: false,
    });
  });

  it('marks the sell own when the pilot holds the cheapest order', () => {
    const book = liveStationBook([sell(1, 100), sell(2, 110)], HUB, new Set([1]));
    expect(book.sellIsOwn).toBe(true);
  });

  it('matches when the pilot ties the cheapest price', () => {
    const book = liveStationBook([sell(1, 100), sell(2, 100)], HUB, new Set([2]));
    expect(book.sellIsOwn).toBe(true);
  });

  it('does not mark own when a rival is cheaper than the pilot', () => {
    const book = liveStationBook([sell(1, 100), sell(2, 110)], HUB, new Set([2]));
    expect(book.sellIsOwn).toBe(false);
  });

  it('ignores a non-positive price', () => {
    expect(liveStationBook([sell(1, 0), sell(2, 50)], HUB, new Set()).sell).toBe(50);
  });
});

describe('applyLiveBooks', () => {
  const items: AppraisalItem[] = [
    { typeId: 1, name: 'A', quantity: 1, buy: 1, sell: 2 },
    { typeId: 2, name: 'B', quantity: 1, buy: 1, sell: 2 },
    { typeId: 3, name: 'C', quantity: 1, buy: 1, sell: 2 },
  ];

  it('swaps a live book in and marks the rest cached or failed', () => {
    const out = applyLiveBooks(items, (typeId) =>
      typeId === 1 ? { sell: 10, buy: 8, sellIsOwn: true } : typeId === 2 ? 'failed' : undefined
    );
    expect(out[0]).toMatchObject({ buy: 8, sell: 10, sellIsOwn: true, priceState: 'live' });
    expect(out[1]).toMatchObject({ buy: 1, sell: 2, priceState: 'failed' });
    expect(out[2]).toMatchObject({ buy: 1, sell: 2, priceState: 'cached' });
  });

  it('keeps a live null side null rather than falling back to the cached price', () => {
    const [first] = applyLiveBooks(items, () => ({ sell: null, buy: 8, sellIsOwn: false }));
    expect(first.sell).toBeNull();
  });
});

describe('the undercut off a live book', () => {
  it('copies the pilot own cheapest price unchanged', () => {
    const [item] = applyLiveBooks(
      [{ typeId: 1, name: 'A', quantity: 1, buy: null, sell: 1 }],
      () => ({
        sell: 1234,
        buy: null,
        sellIsOwn: true,
      })
    );
    expect(appraisalUndercut(item)).toEqual({ price: 1234, atOrBelowBuy: false, matchesOwn: true });
  });

  it('goes one tick under a rival cheapest', () => {
    const [item] = applyLiveBooks(
      [{ typeId: 1, name: 'A', quantity: 1, buy: null, sell: 1 }],
      () => ({
        sell: 1234,
        buy: 1000,
        sellIsOwn: false,
      })
    );
    expect(appraisalUndercut(item)).toEqual({
      price: 1233,
      atOrBelowBuy: false,
      matchesOwn: false,
    });
  });

  it('flags an own price at or below the live best buy', () => {
    const [item] = applyLiveBooks(
      [{ typeId: 1, name: 'A', quantity: 1, buy: null, sell: 1 }],
      () => ({
        sell: 100,
        buy: 100,
        sellIsOwn: true,
      })
    );
    expect(appraisalUndercut(item)?.atOrBelowBuy).toBe(true);
  });
});

describe('liveStationBook with a buy walk', () => {
  const reachBuy = (
    order_id: number,
    price: number,
    over: Partial<LiveOrder> & { volume_remain: number }
  ): LiveOrder => ({ ...buy(order_id, price, 1), system_id: 30000142, range: 'station', ...over });
  const walkAt = (units: number, jumps?: ReadonlyMap<number, number>) => ({
    systemId: 30000142,
    jumps,
    units,
  });

  it('walks past a thin top bid to the average and says what the top bid takes', () => {
    const book = liveStationBook(
      [
        reachBuy(1, 4.5, { location_id: HUB, volume_remain: 40 }),
        reachBuy(2, 4, { location_id: HUB, volume_remain: 460 }),
      ],
      HUB,
      new Set(),
      walkAt(500)
    );
    expect(book.buy).toBeCloseTo((40 * 4.5 + 460 * 4) / 500);
    expect(book.buyWalk).toMatchObject({ topBid: 4.5, topBidTakes: 40, filled: 500, unsold: 0 });
  });

  it('counts a buy order elsewhere in range, and reports units the book cannot take', () => {
    const book = liveStationBook(
      [
        reachBuy(1, 4, { location_id: HUB, volume_remain: 10 }),
        reachBuy(2, 5, { location_id: 9, system_id: 30000143, range: '5', volume_remain: 10 }),
        reachBuy(3, 6, { location_id: 8, system_id: 30000144, range: '2', volume_remain: 10 }),
      ],
      HUB,
      new Set(),
      walkAt(
        30,
        new Map([
          [30000143, 3],
          [30000144, 3],
        ])
      )
    );
    expect(book.buy).toBeCloseTo((10 * 5 + 10 * 4) / 20);
    expect(book.buyWalk).toMatchObject({ filled: 20, unsold: 10 });
  });

  it('carries no walk note where the top bid took every unit', () => {
    const book = liveStationBook(
      [reachBuy(1, 4.5, { location_id: HUB, volume_remain: 100 })],
      HUB,
      new Set(),
      walkAt(40)
    );
    expect(book).toEqual({ sell: null, buy: 4.5, sellIsOwn: false });
  });
});
