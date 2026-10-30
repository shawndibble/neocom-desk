import { describe, expect, it } from 'vitest';
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { countAtMarket, holdersAtMarket, listedAtMarket, sellersAtMarket } from './onHand';

const JITA = 60003760;
const EFA = 1035466617946;

const detected: DetectedOwnedStockMap = new Map([
  [
    34,
    {
      quantity: 700,
      placements: [
        { characterId: 1, locationId: JITA, locationType: 'station', quantity: 500 },
        { characterId: 2, locationId: EFA, locationType: 'other', quantity: 200 },
      ],
    },
  ],
]);

const order = (over: Partial<Parameters<typeof countAtMarket>[1][number]> = {}) => ({
  type_id: 34,
  location_id: EFA,
  volume_remain: 50,
  is_buy_order: false,
  ...over,
});

describe('countAtMarket', () => {
  it('counts own sell orders at the market as listed, and hangar stock at its station apart', () => {
    const counts = countAtMarket(detected, [order(), order({ location_id: JITA })], EFA, [34, 35]);
    expect(counts.get(34)).toEqual({ listed: 50, inHangar: 200 });
    expect(counts.get(35)).toEqual({ listed: 0, inHangar: 0 });
  });

  it('ignores buy orders and types that are not on the list', () => {
    const counts = countAtMarket(
      detected,
      [order({ is_buy_order: true }), order({ type_id: 99 })],
      EFA,
      [34]
    );
    expect(counts.get(34)?.listed).toBe(0);
    expect(counts.has(99)).toBe(false);
  });
});

describe('listedAtMarket', () => {
  it('turns the sell orders at a market into Stock Targets of what is listed now', () => {
    expect(
      listedAtMarket(
        [
          order({ type_id: 34, volume_remain: 50 }),
          order({ type_id: 34, volume_remain: 25 }),
          order({ type_id: 35, volume_remain: 7 }),
          order({ type_id: 36, location_id: JITA }),
          order({ type_id: 37, is_buy_order: true }),
          order({ type_id: 38, volume_remain: 0 }),
        ],
        EFA
      )
    ).toEqual([
      { typeId: 34, target: 75 },
      { typeId: 35, target: 7 },
    ]);
  });
});

describe('holdersAtMarket', () => {
  const stock: DetectedOwnedStockMap = new Map([
    [
      34,
      {
        quantity: 900,
        placements: [
          { characterId: 1, locationId: EFA, locationType: 'other', quantity: 100 },
          { characterId: 2, locationId: EFA, locationType: 'other', quantity: 300 },
          { characterId: 1, locationId: EFA, locationType: 'other', quantity: 50 },
          { characterId: 3, locationId: JITA, locationType: 'station', quantity: 450 },
        ],
      },
    ],
  ]);
  const sell = (characterId: number, qty: number, over = {}) => ({
    ...order({ volume_remain: qty, ...over }),
    characterId,
  });

  it('splits hangar stock and listings per character, biggest first, merging a character', () => {
    const holders = holdersAtMarket(stock, [sell(2, 5), sell(1, 20), sell(1, 10)], EFA, [34]);
    expect(holders.get(34)).toEqual({
      listedBy: [
        { characterId: 1, quantity: 30 },
        { characterId: 2, quantity: 5 },
      ],
      inHangarBy: [
        { characterId: 2, quantity: 300 },
        { characterId: 1, quantity: 150 },
      ],
    });
  });

  it('sums to the countAtMarket totals', () => {
    const orders = [sell(2, 5), sell(1, 20), sell(1, 10, { is_buy_order: true })];
    const total = (list: { quantity: number }[]) => list.reduce((n, h) => n + h.quantity, 0);
    const holders = holdersAtMarket(stock, orders, EFA, [34]).get(34)!;
    const counts = countAtMarket(stock, orders, EFA, [34]).get(34)!;
    expect(total(holders.listedBy)).toBe(counts.listed);
    expect(total(holders.inHangarBy)).toBe(counts.inHangar);
  });

  it('is empty for an item nobody holds there', () => {
    expect(holdersAtMarket(stock, [], EFA, [99]).get(99)).toEqual({ listedBy: [], inHangarBy: [] });
  });
});

describe('sellersAtMarket', () => {
  it('lists characters with sell orders at the market, most orders first', () => {
    const orders = [
      { ...order(), characterId: 2 },
      { ...order(), characterId: 1 },
      { ...order(), characterId: 1 },
      { ...order({ is_buy_order: true }), characterId: 4 },
      { ...order({ location_id: JITA }), characterId: 3 },
    ];
    expect(sellersAtMarket(orders, EFA)).toEqual([1, 2]);
  });
});
