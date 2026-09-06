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

  describe('reprocess and sell the materials', () => {
    const SKILLS = {
      reprocessingLevel: 0,
      reprocessingEfficiencyLevel: 0,
      specialisationLevel: 0,
    };
    /** 10 units refine into 1,000 Tritanium at 100%; at the assumed 50% station that is 500. */
    const ENTRY = { portionSize: 10, materials: [{ typeID: 34, quantity: 1000 }] };

    it('prices the materials across the units actually refined, not the units on hand', () => {
      // 10 of the 10 units on hand refine -> 500 Tritanium at 2 ISK = 1,000
      // ISK over 10 units = 100 a unit, against a fill floor of 380.
      const exits = orderExits({
        row: BASE_ROW,
        reprocessing: { entry: ENTRY, skills: SKILLS, materialPrices: { 34: 2 } },
      });
      expect(exits).toContainEqual({
        kind: 'reprocess',
        price: 100,
        netPerUnit: -280,
        partial: false,
        unitsLeftOver: 0,
      });
    });

    it('reports the stock that cannot make up a whole portion', () => {
      const exits = orderExits({
        row: { ...BASE_ROW, volumeRemain: 23 },
        reprocessing: { entry: ENTRY, skills: SKILLS, materialPrices: { 34: 2 } },
      });
      const refine = exits.find((e) => e.kind === 'reprocess');
      expect(refine?.unitsLeftOver).toBe(3);
    });

    it('offers a worthless refine, rather than hiding it, when nothing makes up a portion', () => {
      const exits = orderExits({
        row: { ...BASE_ROW, volumeRemain: 3 },
        reprocessing: { entry: ENTRY, skills: SKILLS, materialPrices: { 34: 2 } },
      });
      expect(exits).toContainEqual({
        kind: 'reprocess',
        price: 0,
        netPerUnit: -380,
        unitsLeftOver: 3,
      });
    });

    it('flags the total as partial when a material has no price at this station', () => {
      const twoMaterials = {
        portionSize: 10,
        materials: [
          { typeID: 34, quantity: 1000 },
          { typeID: 35, quantity: 100 },
        ],
      };
      const exits = orderExits({
        row: BASE_ROW,
        reprocessing: { entry: twoMaterials, skills: SKILLS, materialPrices: { 34: 2 } },
      });
      expect(exits.find((e) => e.kind === 'reprocess')?.partial).toBe(true);
    });

    it('is absent until the refining data and prices have loaded', () => {
      expect(orderExits({ row: BASE_ROW }).map((e) => e.kind)).toEqual(['hold']);
    });
  });
});
