import { describe, expect, it } from 'vitest';
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { countOnHand } from './onHand';

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

const order = (over: Partial<Parameters<typeof countOnHand>[1][number]> = {}) => ({
  type_id: 34,
  location_id: EFA,
  volume_remain: 50,
  is_buy_order: false,
  ...over,
});

describe('countOnHand', () => {
  it('counts every hangar plus every sell order when the list is counted anywhere', () => {
    const counts = countOnHand(detected, [order()], null, [34, 35]);
    expect(counts.get(34)).toEqual({ inHangars: 700, listed: 50, total: 750 });
    expect(counts.get(35)).toEqual({ inHangars: 0, listed: 0, total: 0 });
  });

  it('counts only what sits at the list location', () => {
    const counts = countOnHand(detected, [order(), order({ location_id: JITA })], EFA, [34]);
    expect(counts.get(34)).toEqual({ inHangars: 200, listed: 50, total: 250 });
  });

  it('ignores buy orders and types that are not on the list', () => {
    const counts = countOnHand(
      detected,
      [order({ is_buy_order: true }), order({ type_id: 99 })],
      null,
      [34]
    );
    expect(counts.get(34)?.listed).toBe(0);
    expect(counts.has(99)).toBe(false);
  });
});
