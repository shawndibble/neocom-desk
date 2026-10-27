import { describe, it, expect } from 'vitest';
import { skillSellPrices } from './skillSellPrices';

const JITA_44 = 60003760;

function sell(price: number, location_id: number) {
  return { price, location_id, is_buy_order: false };
}

describe('skillSellPrices', () => {
  it('prices the hub station and the whole region separately', () => {
    const orders = [sell(2_100_000, JITA_44), sell(2_000_000, 60000364), sell(2_500_000, JITA_44)];
    expect(skillSellPrices(orders, JITA_44)).toEqual({ hub: 2_100_000, region: 2_000_000 });
  });

  it('leaves the hub null when only other stations in the region sell it', () => {
    expect(skillSellPrices([sell(2_000_000, 60000364)], JITA_44)).toEqual({
      hub: null,
      region: 2_000_000,
    });
  });

  it('ignores buy orders', () => {
    const orders = [{ price: 336_800, location_id: JITA_44, is_buy_order: true }];
    expect(skillSellPrices(orders, JITA_44)).toEqual({ hub: null, region: null });
  });
});
