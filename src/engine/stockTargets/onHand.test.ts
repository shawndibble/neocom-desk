import { describe, expect, it } from 'vitest';
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { countAtMarket, listedAtMarket } from './onHand';

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
