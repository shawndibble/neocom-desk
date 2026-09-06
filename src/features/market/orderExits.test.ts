import { describe, it, expect } from 'vitest';
import { orderExits } from './orderExits';
import type { OpenOrderRow } from './openOrdersModel';
import type { CompetingOrder } from '@/engine/market/undercut';

const BASE_ROW: OpenOrderRow = {
  orderId: 101,
  characterId: 1,
  characterName: 'Alpha',
  typeId: 34,
  typeName: 'Tritanium',
  isBuyOrder: false,
  price: 500,
  volumeRemain: 10,
  volumeTotal: 10,
  locationId: 60003760,
  regionId: 10000002,
  stationName: 'Jita IV - Moon 4',
  issued: new Date().toISOString(),
  durationDays: 90,
  expiry: { expiresAt: Date.now() + 60 * 86_400_000, daysLeft: 60, expired: false },
  floor: { relist: 400, fill: 380 },
  costBasis: null,
  station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
  deepUndercut: null,
  worstScope: null,
  problem: 'healthy',
  problems: ['healthy'],
  iskTiedUp: 5000,
  belowFloor: false,
};

function buyOrder(overrides: Partial<CompetingOrder>): CompetingOrder {
  return {
    orderId: 1,
    price: 300,
    locationId: 60003760,
    systemId: 30000142,
    volumeRemain: 100,
    isBuyOrder: true,
    ...overrides,
  };
}

describe('orderExits', () => {
  it('prices holding against the fill floor, since the broker fee is already sunk', () => {
    expect(orderExits({ row: BASE_ROW })).toEqual([{ kind: 'hold', price: 500, netPerUnit: 120 }]);
  });

  it('prices matching against the relist floor, which pays the broker fee again', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderExits({ row })).toContainEqual({
      kind: 'matchStation',
      price: 450,
      netPerUnit: 50,
    });
  });

  it('offers the best buy order at my own station, priced against the fill floor', () => {
    const competitors = [
      buyOrder({ orderId: 2, price: 320 }),
      buyOrder({ orderId: 3, price: 350 }),
      // A sell order at the same station is not an exit.
      buyOrder({ orderId: 4, price: 900, isBuyOrder: false }),
    ];
    expect(orderExits({ row: BASE_ROW, competitors })).toContainEqual({
      kind: 'dumpToBuyOrder',
      price: 350,
      netPerUnit: -30,
    });
  });

  it('ignores buy orders elsewhere in the region, whose range may not reach my stock', () => {
    const competitors = [buyOrder({ orderId: 5, price: 490, locationId: 60003761 })];
    expect(orderExits({ row: BASE_ROW, competitors }).map((e) => e.kind)).toEqual(['hold']);
  });

  it('offers nothing without a floor to price the exits against', () => {
    expect(orderExits({ row: { ...BASE_ROW, floor: null } })).toEqual([]);
  });

  it('offers nothing for a buy order', () => {
    expect(orderExits({ row: { ...BASE_ROW, isBuyOrder: true } })).toEqual([]);
  });
});
