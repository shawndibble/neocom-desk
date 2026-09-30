import { describe, expect, it } from 'vitest';
import type { MarketHistoryPoint } from './priceHistory';
import {
  HAULING_THRESHOLDS,
  buildBuyLadder,
  buildSellLadder,
  estimateSale,
  hubLadders,
  haulingFlags,
  lotEconomics,
  summarizeDemand,
  walkInstant,
  walkLadder,
  type LadderLevel,
} from './haulingMarket';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

function day(offset: number, volume: number, average: number): MarketHistoryPoint {
  const d = new Date(Date.UTC(2026, 8, 26 - offset));
  return {
    date: d.toISOString().slice(0, 10),
    average,
    highest: average,
    lowest: average,
    volume,
    orderCount: 5,
  };
}

describe('summarizeDemand', () => {
  it('counts days with trades and averages daily volume over the 30-day window', () => {
    const points = Array.from({ length: 24 }, (_, i) => day(i, 10, 100));
    const s = summarizeDemand(points, '2026-09-26');
    expect(s.daysWithTrades).toBe(24);
    expect(s.dailyVolume).toBeCloseTo(8); // 240 units over 30 days
    expect(s.demand).toBe('most-days');
  });

  it('ignores days older than the window', () => {
    const points = [day(0, 10, 100), day(45, 9999, 1)];
    const s = summarizeDemand(points, '2026-09-26');
    expect(s.daysWithTrades).toBe(1);
    expect(s.dailyVolume).toBeCloseTo(10 / 30);
  });

  it('labels 8..19 trading days as bursts and fewer as rarely', () => {
    expect(
      summarizeDemand(
        Array.from({ length: 8 }, (_, i) => day(i, 1, 5)),
        '2026-09-26'
      ).demand
    ).toBe('bursts');
    expect(
      summarizeDemand(
        Array.from({ length: 19 }, (_, i) => day(i, 1, 5)),
        '2026-09-26'
      ).demand
    ).toBe('bursts');
    expect(
      summarizeDemand(
        Array.from({ length: 7 }, (_, i) => day(i, 1, 5)),
        '2026-09-26'
      ).demand
    ).toBe('rarely');
  });

  it('prices recent sales as the volume-weighted median over the last 7 days', () => {
    const points = [day(0, 10, 200), day(1, 30, 100), day(20, 1000, 1)];
    expect(summarizeDemand(points, '2026-09-26').recentSalePrice).toBeCloseTo(100); // 30 of 40 units sold at 100
  });

  it('falls back to the 30-day median when nothing traded in the last 7 days', () => {
    const points = [day(10, 10, 100), day(12, 10, 200)];
    expect(summarizeDemand(points, '2026-09-26').recentSalePrice).toBeCloseTo(100);
  });

  it('has no price and rarely demand with no history at all', () => {
    const s = summarizeDemand([], '2026-09-26');
    expect(s.recentSalePrice).toBeNull();
    expect(s.dailyVolume).toBe(0);
    expect(s.demand).toBe('rarely');
  });
});

describe('summarizeDemand outliers', () => {
  it('is not moved by one stray trade at a wildly different price', () => {
    const points = [day(0, 1000, 0.23), day(1, 1000, 0.23), day(2, 1000, 0.23), day(3, 1381, 1000)];
    expect(summarizeDemand(points, '2026-09-26').recentSalePrice).toBeCloseTo(0.23);
  });
});

describe('summarizeDemand single trader', () => {
  it('counts an item traded by one order a day as rarely selling, however many days it traded', () => {
    const points = Array.from({ length: 25 }, (_, i) => ({ ...day(i, 10, 100), orderCount: 1 }));
    const s = summarizeDemand(points, '2026-09-26');
    expect(s.daysWithTrades).toBe(25);
    expect(s.demand).toBe('rarely');
  });
});

describe('buildSellLadder', () => {
  it('keeps only sell orders, groups equal prices, sorts cheapest first', () => {
    const ladder = buildSellLadder([
      { price: 12, volume_remain: 5, is_buy_order: false },
      { price: 10, volume_remain: 3, is_buy_order: false },
      { price: 10, volume_remain: 4, is_buy_order: false },
      { price: 9, volume_remain: 99, is_buy_order: true },
    ]);
    expect(ladder).toEqual([
      { price: 10, units: 7, orders: 2 },
      { price: 12, units: 5, orders: 1 },
    ]);
  });
});

describe('estimateSale', () => {
  const ladder: LadderLevel[] = [
    { price: 100, units: 10, orders: 3 },
    { price: 100.5, units: 20, orders: 2 },
    { price: 130, units: 60, orders: 4 },
  ];

  it('is null without a ladder, demand or a recent sale price', () => {
    expect(estimateSale({ ladder: [], dailyVolume: 5, recentSalePrice: 100 })).toBeNull();
    expect(estimateSale({ ladder, dailyVolume: 0, recentSalePrice: 100 })).toBeNull();
    expect(estimateSale({ ladder, dailyVolume: 5, recentSalePrice: null })).toBeNull();
  });

  it('prices one tick under the cheapest listing when it recently sold at least that high', () => {
    const e = estimateSale({ ladder, dailyVolume: 5, recentSalePrice: 500 })!;
    expect(e.lowestAsk).toBe(100);
    expect(e.price).toBeLessThan(100);
    expect(e.price).toBe(e.undercutPrice);
  });

  it('never expects more than it recently sold for', () => {
    const e = estimateSale({ ladder, dailyVolume: 5, recentSalePrice: 80 })!;
    expect(e.price).toBe(80);
  });

  it('never prices above the cheapest listing', () => {
    for (const recent of [50, 99, 100, 101, 500]) {
      expect(estimateSale({ ladder, dailyVolume: 5, recentSalePrice: recent })!.price).toBeLessThan(
        100.0001
      );
    }
  });

  it('counts units within 1% of the price as ahead, since those sellers will relist below you', () => {
    const e = estimateSale({ ladder, dailyVolume: 5, recentSalePrice: 500 })!;
    // 100 and 100.5 sit within 1% of the ~99.9 price; 130 does not.
    expect(e.unitsAhead).toBe(30);
    // reference lot = one day's sales (5): (30 + 5) / 5 = 7 days
    expect(e.daysToSell).toBeCloseTo(7);
  });

  it('has nothing ahead when it has only ever traded well below the book', () => {
    const e = estimateSale({ ladder, dailyVolume: 5, recentSalePrice: 60 })!;
    expect(e.unitsAhead).toBe(0);
    expect(e.daysToSell).toBeCloseTo(1);
  });

  it('caps the units worth bringing at a week of sales minus those ahead, never below 1', () => {
    const e = estimateSale({ ladder, dailyVolume: 5, recentSalePrice: 500 })!;
    expect(e.demandCapUnits).toBe(5); // 35 - 30
    const thin = estimateSale({ ladder, dailyVolume: 0.1, recentSalePrice: 500 })!;
    expect(thin.demandCapUnits).toBe(1);
  });
});

describe('haulingFlags', () => {
  it('flags a crowded book when many orders sit within 1% of the lowest ask', () => {
    const ladder: LadderLevel[] = [
      { price: 100, units: 10, orders: 6 },
      { price: 100.9, units: 10, orders: 5 },
      { price: 150, units: 10, orders: 1 },
    ];
    expect(haulingFlags({ ladder, demand: 'most-days', marginPct: 10 })).toContain('crowded');
    expect(
      haulingFlags({ ladder: ladder.slice(2), demand: 'most-days', marginPct: 10 })
    ).not.toContain('crowded');
  });

  it('flags a thin market when it rarely sells, and a low margin under the floor', () => {
    const flags = haulingFlags({ ladder: [], demand: 'rarely', marginPct: 1 });
    expect(flags).toEqual(expect.arrayContaining(['thin', 'low-margin']));
  });
});

describe('haulingFlags outlier', () => {
  it('flags a margin too good to be true, and not an ordinary one', () => {
    expect(haulingFlags({ ladder: [], demand: 'most-days', marginPct: 250 })).toContain('outlier');
    expect(haulingFlags({ ladder: [], demand: 'most-days', marginPct: 40 })).not.toContain(
      'outlier'
    );
  });
});

describe('walkLadder', () => {
  const ladder: LadderLevel[] = [
    { price: 10, units: 5, orders: 1 },
    { price: 20, units: 5, orders: 1 },
  ];
  it('buys through the cheapest levels first', () => {
    expect(walkLadder(ladder, 7)).toEqual({ filled: 7, cost: 5 * 10 + 2 * 20 });
  });
  it('fills only what exists', () => {
    expect(walkLadder(ladder, 50)).toEqual({ filled: 10, cost: 150 });
  });
  it('is empty for a zero quantity', () => {
    expect(walkLadder(ladder, 0)).toEqual({ filled: 0, cost: 0 });
  });
});

describe('lotEconomics', () => {
  const buyLadder: LadderLevel[] = [{ price: 1000, units: 100, orders: 4 }];

  it('nets sales tax and broker fee off the sale and reports margin on the ISK spent', () => {
    const r = lotEconomics({ buyLadder, expectedPrice: 1200, quantity: 10, fees: FEES });
    expect(r.filled).toBe(10);
    expect(r.cost).toBe(10_000);
    // Accounting V: 3.375% tax. Broker Relations IV, base standings: 3% - 1.2% = 1.8%.
    const gross = 12_000;
    const fees = gross * 0.03375 + gross * 0.018;
    expect(r.profit).toBeCloseTo(gross - fees - 10_000);
    expect(r.marginPct).toBeCloseTo((r.profit / 10_000) * 100);
    expect(r.salesTax).toBeCloseTo(gross * 0.03375);
    expect(r.brokerFee).toBeCloseTo(gross * 0.018);
    expect(r.salesTaxPct).toBeCloseTo(3.375);
    expect(r.brokerFeePct).toBeCloseTo(1.8);
  });

  it('charges the 100 ISK broker minimum on a small listing', () => {
    const r = lotEconomics({
      buyLadder: [{ price: 1, units: 5, orders: 1 }],
      expectedPrice: 2,
      quantity: 1,
      fees: FEES,
    });
    expect(r.profit).toBeCloseTo(2 - 2 * 0.03375 - 100 - 1);
  });

  it('prices only the units that exist at the source', () => {
    const r = lotEconomics({
      buyLadder: [{ price: 100, units: 3, orders: 1 }],
      expectedPrice: 200,
      quantity: 10,
      fees: FEES,
    });
    expect(r.filled).toBe(3);
  });
});

describe('buildBuyLadder', () => {
  it('keeps buy orders only, one level per price, dearest first', () => {
    expect(
      buildBuyLadder([
        { price: 90, volume_remain: 5, is_buy_order: true },
        { price: 95, volume_remain: 2, is_buy_order: true },
        { price: 90, volume_remain: 3, is_buy_order: true },
        { price: 120, volume_remain: 7, is_buy_order: false },
        { price: 99, volume_remain: 0, is_buy_order: true },
      ])
    ).toEqual([
      { price: 95, units: 2, orders: 1 },
      { price: 90, units: 8, orders: 2 },
    ]);
  });
});

describe('hubLadders', () => {
  it('reads both sides of the book at the hub station only', () => {
    const ladders = hubLadders(
      [
        { price: 100, volume_remain: 4, is_buy_order: false, location_id: 1 },
        { price: 99, volume_remain: 9, is_buy_order: false, location_id: 2 },
        { price: 90, volume_remain: 6, is_buy_order: true, location_id: 1 },
        // A dearer buy order elsewhere in the region: its range is not read, so it never counts.
        { price: 98, volume_remain: 50, is_buy_order: true, location_id: 2 },
      ],
      1
    );
    expect(ladders.sell).toEqual([{ price: 100, units: 4, orders: 1 }]);
    expect(ladders.buy).toEqual([{ price: 90, units: 6, orders: 1 }]);
  });
});

describe('walkInstant', () => {
  // Accounting V: 3.375% sales tax, no broker fee (nothing is listed).
  const origin: LadderLevel[] = [
    { price: 100, units: 10, orders: 1 },
    { price: 105, units: 20, orders: 2 },
  ];
  const destBuys: LadderLevel[] = [
    { price: 115, units: 5, orders: 1 },
    { price: 110, units: 12, orders: 2 },
    { price: 108, units: 100, orders: 3 },
  ];

  it('pairs the cheapest sells with the dearest buys and stops at the first unit that loses money', () => {
    // 5 @100→115, 5 @100→110, 7 @105→110; then 105→108 nets 104.355 < 105 and the walk stops
    // partway through the origin's 105 level.
    const r = walkInstant({ originLadder: origin, destBuyLadder: destBuys, accountingLevel: 5 });
    expect(r.units).toBe(17);
    expect(r.cost).toBe(1735);
    expect(r.revenue).toBe(1895);
    expect(r.salesTax).toBeCloseTo(1895 * 0.03375);
    expect(r.profit).toBeCloseTo(1895 - 1895 * 0.03375 - 1735);
  });

  it('stops when either book runs out', () => {
    const r = walkInstant({
      originLadder: origin,
      destBuyLadder: [{ price: 115, units: 5, orders: 1 }],
      accountingLevel: 5,
    });
    expect(r.units).toBe(5);
    expect(r.cost).toBe(500);
  });

  it('never takes a unit that only breaks even', () => {
    // Accounting 0: 7.5% of 200 is 15, so a 185 buy nets exactly zero.
    const r = walkInstant({
      originLadder: [{ price: 185, units: 10, orders: 1 }],
      destBuyLadder: [{ price: 200, units: 10, orders: 1 }],
      accountingLevel: 0,
    });
    expect(r).toMatchObject({ units: 0, cost: 0, revenue: 0, profit: 0 });
  });

  it('stops at maxUnits', () => {
    const r = walkInstant({
      originLadder: origin,
      destBuyLadder: destBuys,
      accountingLevel: 5,
      maxUnits: 3,
    });
    expect(r).toMatchObject({ units: 3, cost: 300, revenue: 345 });
  });
});

describe('lotEconomics, selling into buy orders', () => {
  const buyLadder: LadderLevel[] = [{ price: 100, units: 50, orders: 1 }];
  const destBuyLadder: LadderLevel[] = [
    { price: 120, units: 4, orders: 1 },
    { price: 110, units: 4, orders: 1 },
  ];

  it('realises the buy orders dearest first and pays sales tax only', () => {
    const r = lotEconomics({ buyLadder, expectedPrice: 0, quantity: 6, fees: FEES, destBuyLadder });
    expect(r.filled).toBe(6);
    expect(r.cost).toBe(600);
    expect(r.revenue).toBe(4 * 120 + 2 * 110);
    expect(r.brokerFee).toBe(0);
    expect(r.brokerFeePct).toBe(0);
    expect(r.salesTax).toBeCloseTo(700 * 0.03375);
    expect(r.profit).toBeCloseTo(700 - 700 * 0.03375 - 600);
  });

  it('caps the lot at the destination book, buying only what can be sold', () => {
    const r = lotEconomics({
      buyLadder,
      expectedPrice: 0,
      quantity: 20,
      fees: FEES,
      destBuyLadder,
    });
    expect(r.filled).toBe(8);
    expect(r.cost).toBe(800);
  });
});

describe('thresholds', () => {
  it('are one typed object so the placeholders are easy to find', () => {
    expect(HAULING_THRESHOLDS).toMatchObject({
      horizonDays: 7,
      historyDays: 30,
      mostDaysMin: 20,
      burstsMin: 8,
    });
  });
});
