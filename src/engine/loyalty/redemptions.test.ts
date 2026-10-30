import { describe, expect, it } from 'vitest';
import type { HubOrder } from '@/engine/market/haulingMarket';
import type { ReachableBuyOrder } from '@/engine/market/buyReach';
import { priceRedemptions, type RedemptionsInput } from './redemptions';

const STATION = 60003760;

function sell(price: number, volume: number): HubOrder {
  return { price, volume_remain: volume, is_buy_order: false, location_id: STATION };
}

function bid(price: number, volumeRemain: number): ReachableBuyOrder {
  return { price, volumeRemain, range: 'station', locationId: STATION, systemId: 1 };
}

function input(over: Partial<RedemptionsInput> = {}): RedemptionsInput {
  return {
    redemptions: 10,
    iskCost: 1000,
    lpCost: 100,
    requiredItems: [{ typeId: 34, quantity: 5, unitPrice: 10 }],
    outputUnits: 1,
    outputTopUnitPrice: 5000,
    buildCost: 0,
    stationId: STATION,
    sellBooks: new Map([[34, [sell(10, 20), sell(20, 100)]]]),
    outputBasis: 'order',
    buyOrders: undefined,
    liquidationBasis: 'order',
    skills: {},
    playerLp: null,
    ...over,
  };
}

describe('priceRedemptions', () => {
  it('walks the sell book for N × quantity and marks the line that moved', () => {
    const r = priceRedemptions(input());
    // 50 units: 20 @ 10 + 30 @ 20
    expect(r.requiredLines[0]).toMatchObject({ unitsNeeded: 50, filled: 20 + 30, unfilled: 0 });
    expect(r.requiredLines[0]!.lineCost).toBe(800);
    expect(r.requiredLines[0]!.moved).toBe(true);
    expect(r.requiredItemsCost).toBe(800);
  });

  it('does not mark a line the top of book covers', () => {
    const r = priceRedemptions(input({ redemptions: 2 }));
    expect(r.requiredLines[0]!.moved).toBe(false);
    expect(r.requiredLines[0]!.lineCost).toBe(100);
  });

  it('states units the book cannot fill and leaves the cost unpriced', () => {
    const r = priceRedemptions(input({ redemptions: 100 }));
    expect(r.requiredLines[0]).toMatchObject({ unitsNeeded: 500, filled: 120, unfilled: 380 });
    expect(r.requiredItemsCost).toBeNull();
    expect(r.profit.profit).toBeNull();
  });

  it('keeps the output at top of book on the list-order basis', () => {
    const r = priceRedemptions(input());
    expect(r.output.revenue).toBe(50000);
    expect(r.output.moved).toBe(false);
  });

  it('walks the reachable buy book on the instant basis', () => {
    const r = priceRedemptions(
      input({
        outputBasis: 'instant',
        liquidationBasis: 'instant',
        buyOrders: [bid(5000, 4), bid(4000, 100)],
      })
    );
    // 10 units: 4 @ 5000 + 6 @ 4000
    expect(r.output.revenue).toBe(44000);
    expect(r.output.moved).toBe(true);
    expect(r.output.unsold).toBe(0);
  });

  it('states output units the buy book cannot take', () => {
    const r = priceRedemptions(
      input({ outputBasis: 'instant', liquidationBasis: 'instant', buyOrders: [bid(5000, 4)] })
    );
    expect(r.output).toMatchObject({ filled: 4, unsold: 6, revenue: 20000 });
  });

  it('falls back to scaled top of book while the buy book is still loading', () => {
    const r = priceRedemptions(
      input({ outputBasis: 'instant', liquidationBasis: 'instant', buyOrders: undefined })
    );
    expect(r.output.revenue).toBe(50000);
  });

  it('scales ISK, LP and build cost, and lists the items to buy', () => {
    const r = priceRedemptions(input({ buildCost: 7 }));
    expect(r.totals).toMatchObject({ iskCost: 10000, lpCost: 1000 });
    expect(r.totals.itemsToBuy).toEqual([{ typeId: 34, units: 50 }]);
    expect(r.profit.iskPerLp).toBe(r.profit.profit! / 1000);
  });

  it('prices a line with no book at scaled top of book, unmarked', () => {
    const r = priceRedemptions(input({ sellBooks: new Map() }));
    expect(r.requiredLines[0]).toMatchObject({ lineCost: 500, moved: false, unfilled: 0 });
  });
});
