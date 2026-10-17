import { describe, expect, it } from 'vitest';
import { openOrderRow } from './__fixtures__/openOrderRow';
import {
  EMPTY_WORK_THROUGH,
  ORDERS_CACHE_MS,
  clickTimePrice,
  isNotChanged,
  workThroughLoss,
  workThroughProgress,
  workThroughQueue,
  type HandledOrder,
} from './workThrough';

const belowFloor = (orderId: number) =>
  openOrderRow({ orderId, problem: 'belowFloor', problems: ['belowFloor'] });
const undercut = (orderId: number) =>
  openOrderRow({ orderId, problem: 'undercutStation', problems: ['undercutStation'] });
const healthy = (orderId: number) => openOrderRow({ orderId });
const notChecked = (orderId: number) => openOrderRow({ orderId, competitionUnchecked: true });

function handled(orderId: number, overrides: Partial<HandledOrder> = {}): HandledOrder {
  return {
    orderId,
    characterId: 1,
    previousPrice: 500,
    issued: '2026-10-01T00:00:00Z',
    newPrice: 499,
    copied: true,
    sent: true,
    sentAt: 1_000,
    ...overrides,
  };
}

describe('workThroughQueue', () => {
  const regionUndercut = (orderId: number) =>
    openOrderRow({ orderId, problem: 'undercutRegion', problems: ['undercutRegion'] });

  it('keeps the table order, Needs you before Watch, and leaves out healthy and not-checked orders', () => {
    const rows = [
      belowFloor(2),
      regionUndercut(5),
      undercut(3),
      healthy(9),
      notChecked(8),
      undercut(1),
      belowFloor(4),
    ];
    expect(workThroughQueue(rows).map((r) => r.orderId)).toEqual([2, 3, 1, 4, 5]);
  });
});

describe('workThroughProgress', () => {
  const queue = [belowFloor(2), belowFloor(4), undercut(3), undercut(1)];

  it('starts at the first order in the queue', () => {
    const progress = workThroughProgress(queue, EMPTY_WORK_THROUGH);
    expect(progress.current?.orderId).toBe(2);
    expect(progress.position).toBe(1);
    expect(progress.total).toBe(4);
  });

  it('moves past orders already handled or skipped', () => {
    const progress = workThroughProgress(queue, {
      handled: new Map([[2, handled(2)]]),
      skipped: new Set([4]),
    });
    expect(progress.current?.orderId).toBe(3);
    expect(progress.position).toBe(3);
    expect(progress.total).toBe(4);
  });

  it('keeps counting an order already handled after it leaves the queue', () => {
    const progress = workThroughProgress(queue.slice(1), {
      handled: new Map([[2, handled(2)]]),
      skipped: new Set(),
    });
    expect(progress.current?.orderId).toBe(4);
    expect(progress.position).toBe(2);
    expect(progress.total).toBe(4);
  });

  it('re-forms the rest of the queue when the queue order changes', () => {
    const state = { handled: new Map([[2, handled(2)]]), skipped: new Set<number>() };
    const resorted = [belowFloor(2), undercut(1), undercut(3), belowFloor(4)];
    expect(workThroughProgress(resorted, state).current?.orderId).toBe(1);
  });

  it('has no current order once every order is done', () => {
    const progress = workThroughProgress([belowFloor(2)], {
      handled: new Map([[2, handled(2)]]),
      skipped: new Set(),
    });
    expect(progress.current).toBeNull();
    expect(progress.position).toBe(1);
    expect(progress.total).toBe(1);
  });
});

describe('clickTimePrice', () => {
  const station = 60003760;
  const other = 60008494;
  const sell = (orderId: number, price: number, locationId = station) => ({
    orderId,
    price,
    locationId,
    isBuyOrder: false,
  });
  const buy = (orderId: number, price: number) => ({
    orderId,
    price,
    locationId: station,
    isBuyOrder: true,
  });

  it('undercuts the cheapest other sell order at the station by one tick', () => {
    const row = openOrderRow({ orderId: 1, price: 4.15, locationId: station });
    const book = [sell(1, 4.15), sell(2, 4.13), sell(3, 4.14), sell(4, 3.5, other), buy(5, 5)];
    expect(clickTimePrice(row, book, new Set([1]))).toEqual({ kind: 'price', price: 4.12 });
  });

  it('never undercuts the player’s own orders, on any Character', () => {
    const row = openOrderRow({ orderId: 1, price: 600, locationId: station });
    const book = [sell(1, 600), sell(2, 590), sell(3, 595)];
    expect(clickTimePrice(row, book, new Set([1, 2]))).toEqual({ kind: 'price', price: 594.9 });
  });

  it('keeps the price of an order already leading at its station', () => {
    const row = openOrderRow({ orderId: 1, price: 500, locationId: station });
    expect(clickTimePrice(row, [sell(1, 500), sell(2, 520)], new Set([1]))).toEqual({
      kind: 'price',
      price: 500,
    });
    const bid = openOrderRow({ orderId: 1, isBuyOrder: true, price: 5, locationId: station });
    expect(clickTimePrice(bid, [buy(1, 5), buy(2, 4)], new Set([1]))).toEqual({
      kind: 'price',
      price: 5,
    });
  });

  it('outbids the highest other buy order for a buy order', () => {
    const row = openOrderRow({ orderId: 1, isBuyOrder: true, price: 3.98, locationId: station });
    const book = [buy(1, 3.98), buy(2, 4.01), buy(3, 3.99), sell(4, 4.5)];
    expect(clickTimePrice(row, book, new Set([1]))).toEqual({ kind: 'price', price: 4.02 });
  });

  it('says so when no other order sits at the station', () => {
    const row = openOrderRow({ orderId: 1, locationId: station });
    expect(clickTimePrice(row, [sell(1, 500), sell(2, 400, other)], new Set([1]))).toEqual({
      kind: 'noRival',
    });
  });

  it('says so when undercutting would fall under the smallest tick', () => {
    const row = openOrderRow({ orderId: 1, price: 0.02, locationId: station });
    expect(clickTimePrice(row, [sell(2, 0.01)], new Set([1]))).toEqual({ kind: 'noRival' });
  });
});

describe('isNotChanged', () => {
  const sent = handled(1, { previousPrice: 500, issued: '2026-10-01T00:00:00Z', sentAt: 1_000 });
  const after = 1_000 + ORDERS_CACHE_MS;

  it('is true only for an orders read that postdates the press with the same price and issued time', () => {
    expect(isNotChanged(sent, { price: 500, issued: '2026-10-01T00:00:00Z' }, after)).toBe(true);
  });

  it('is false for a read that could still be ESI’s cached body from before the press', () => {
    const same = { price: 500, issued: '2026-10-01T00:00:00Z' };
    expect(isNotChanged(sent, same, 500)).toBe(false);
    expect(isNotChanged(sent, same, 2_000)).toBe(false);
    expect(isNotChanged(sent, same, after - 1)).toBe(false);
  });

  it('is false once the price or the issued time moved', () => {
    expect(isNotChanged(sent, { price: 499, issued: '2026-10-01T00:00:00Z' }, after)).toBe(false);
    expect(isNotChanged(sent, { price: 500, issued: '2026-10-02T00:00:00Z' }, after)).toBe(false);
  });

  it('is false when the order is gone', () => {
    expect(isNotChanged(sent, undefined, after)).toBe(false);
  });
});

describe('workThroughLoss', () => {
  const floor = { relist: 6.1, fill: 6 };

  it('totals the loss against the floor over the units left', () => {
    const row = openOrderRow({ floor, volumeRemain: 1_000, problem: 'belowFloor' });
    const loss = workThroughLoss(row, 4.12);
    expect(loss?.kind).toBe('loss');
    expect(loss?.kind === 'loss' && loss.amount).toBeCloseTo(1_980);
  });

  it('is null when the new price clears the floor', () => {
    expect(workThroughLoss(openOrderRow({ floor }), 6.2)).toBeNull();
  });

  it('says the cost is unknown for a below-floor order without a cost basis, never a figure', () => {
    const row = openOrderRow({ floor: null, problem: 'belowFloor', problems: ['belowFloor'] });
    expect(workThroughLoss(row, 4.12)).toEqual({ kind: 'costUnknown' });
  });

  it('is null for an order without a cost basis that is not below its floor', () => {
    expect(workThroughLoss(openOrderRow({ floor: null }), 4.12)).toBeNull();
  });

  it('is null for a buy order', () => {
    expect(workThroughLoss(openOrderRow({ isBuyOrder: true, floor }), 4.12)).toBeNull();
  });
});
