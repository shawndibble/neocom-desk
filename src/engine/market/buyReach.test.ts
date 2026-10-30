import { describe, expect, it } from 'vitest';
import { buyOrderReaches, walkSellIntoBuys, type ReachableBuyOrder } from './buyReach';

const STATION = { locationId: 1, systemId: 100 };

function buy(over: Partial<ReachableBuyOrder> = {}): ReachableBuyOrder {
  return {
    price: 10,
    volumeRemain: 100,
    minVolume: 1,
    range: 'station',
    locationId: 1,
    systemId: 100,
    ...over,
  };
}

describe('buyOrderReaches', () => {
  const jumps = new Map([
    [100, 0],
    [101, 3],
    [102, 6],
  ]);

  it('counts any order at the station', () => {
    expect(buyOrderReaches(buy(), STATION, jumps)).toBe(true);
  });

  it('counts a numbered range that covers the jump distance, not one that falls short', () => {
    const far = { locationId: 2, systemId: 101 };
    expect(buyOrderReaches(buy({ ...far, range: '5' }), STATION, jumps)).toBe(true);
    expect(buyOrderReaches(buy({ ...far, range: '3' }), STATION, jumps)).toBe(true);
    expect(buyOrderReaches(buy({ ...far, range: '2' }), STATION, jumps)).toBe(false);
  });

  it('counts a region order, and a solarsystem order only in the same system', () => {
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 102, range: 'region' }), STATION, jumps)
    ).toBe(true);
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 100, range: 'solarsystem' }), STATION, jumps)
    ).toBe(true);
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 101, range: 'solarsystem' }), STATION, jumps)
    ).toBe(false);
  });

  it('never counts a station-range order elsewhere', () => {
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 100, range: 'station' }), STATION, jumps)
    ).toBe(false);
  });

  it('skips a numbered order when the distance is unknown', () => {
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 999, range: '40' }), STATION, jumps)
    ).toBe(false);
    expect(
      buyOrderReaches(buy({ locationId: 2, systemId: 101, range: '40' }), STATION, undefined)
    ).toBe(false);
  });
});

describe('walkSellIntoBuys', () => {
  it('walks dearest first and prices the average', () => {
    const walk = walkSellIntoBuys(
      [buy({ price: 4, volumeRemain: 460 }), buy({ price: 4.5, volumeRemain: 40 })],
      500
    );
    expect(walk.filled).toBe(500);
    expect(walk.unsold).toBe(0);
    expect(walk.revenue).toBeCloseTo(40 * 4.5 + 460 * 4);
    expect(walk.average).toBeCloseTo(walk.revenue / 500);
    expect(walk.topBid).toBe(4.5);
    expect(walk.topBidTakes).toBe(40);
    expect(walk.movedPrice).toBe(true);
  });

  it('reports units the book cannot take as unsold', () => {
    const walk = walkSellIntoBuys([buy({ price: 5, volumeRemain: 30 })], 50);
    expect(walk.filled).toBe(30);
    expect(walk.unsold).toBe(20);
    expect(walk.movedPrice).toBe(false);
  });

  it('skips an order whose min volume exceeds the units still to sell', () => {
    const walk = walkSellIntoBuys(
      [buy({ price: 9, volumeRemain: 100, minVolume: 50 }), buy({ price: 5, volumeRemain: 100 })],
      10
    );
    expect(walk.revenue).toBe(50);
    expect(walk.topBid).toBe(5);
  });

  it('takes a min-volume order while enough units remain', () => {
    const walk = walkSellIntoBuys(
      [buy({ price: 9, volumeRemain: 20, minVolume: 15 }), buy({ price: 5, volumeRemain: 100 })],
      25
    );
    // 20 at 9, then 5 left: the 5-ISK order takes them.
    expect(walk.revenue).toBe(20 * 9 + 5 * 5);
  });

  it('returns an empty walk with no orders', () => {
    const walk = walkSellIntoBuys([], 10);
    expect(walk).toMatchObject({ filled: 0, unsold: 10, revenue: 0, average: null, topBid: null });
  });
});
