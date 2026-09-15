import { describe, it, expect } from 'vitest';
import {
  cheapestLpOffer,
  priceLpOffer,
  type LpStoreOfferInput,
} from '@/engine/market/lpAcquisition';

const asteroOffer: LpStoreOfferInput = {
  corporationId: 1000125,
  corpName: 'Sisters of EVE',
  quantityPerRedemption: 1,
  lpCostPerRedemption: 400_000,
  iskCostPerRedemption: 850_000,
  requiredItemsCostPerRedemption: 0,
  playerLp: 500_000,
};

describe('priceLpOffer', () => {
  it('prices one redemption when the needed quantity is exactly one bundle', () => {
    const result = priceLpOffer(asteroOffer, 1);
    expect(result).toEqual({
      corporationId: 1000125,
      corpName: 'Sisters of EVE',
      lpCost: 400_000,
      iskCost: 850_000,
      affordableLp: true,
    });
  });

  it('rounds up to whole redemptions when the quantity does not divide evenly', () => {
    const offer: LpStoreOfferInput = { ...asteroOffer, quantityPerRedemption: 5 };
    const result = priceLpOffer(offer, 6);
    // 6 units needs 2 redemptions of 5, same "batch forces overproduction" rule as a blueprint run.
    expect(result?.lpCost).toBe(800_000);
    expect(result?.iskCost).toBe(1_700_000);
  });

  it('folds required-items cost into each redemption', () => {
    const offer: LpStoreOfferInput = { ...asteroOffer, requiredItemsCostPerRedemption: 50_000 };
    const result = priceLpOffer(offer, 1);
    expect(result?.iskCost).toBe(900_000);
  });

  it('flags unaffordable when the LP balance falls short', () => {
    const offer: LpStoreOfferInput = { ...asteroOffer, playerLp: 100_000 };
    const result = priceLpOffer(offer, 1);
    expect(result?.affordableLp).toBe(false);
  });

  it('is null when a required item has no hub price', () => {
    const offer: LpStoreOfferInput = { ...asteroOffer, requiredItemsCostPerRedemption: null };
    expect(priceLpOffer(offer, 1)).toBeNull();
  });

  it('never divides by zero on a malformed zero-quantity offer', () => {
    const offer: LpStoreOfferInput = { ...asteroOffer, quantityPerRedemption: 0 };
    const result = priceLpOffer(offer, 3);
    // Falls back to one unit per redemption rather than Infinity/NaN.
    expect(result?.lpCost).toBe(1_200_000);
  });
});

describe('cheapestLpOffer', () => {
  it('picks the cheaper of two corps selling the same item', () => {
    const cheaper: LpStoreOfferInput = {
      ...asteroOffer,
      corporationId: 1000126,
      corpName: 'Cheaper Corp',
      iskCostPerRedemption: 100_000,
    };
    const result = cheapestLpOffer([asteroOffer, cheaper], 1);
    expect(result?.corpName).toBe('Cheaper Corp');
    expect(result?.corporationId).toBe(1000126);
  });

  it('skips unpriceable offers rather than letting them win as free', () => {
    const unpriceable: LpStoreOfferInput = {
      ...asteroOffer,
      corpName: 'Unpriceable Corp',
      iskCostPerRedemption: 0,
      requiredItemsCostPerRedemption: null,
    };
    const result = cheapestLpOffer([unpriceable, asteroOffer], 1);
    expect(result?.corpName).toBe('Sisters of EVE');
  });

  it('is null when every offer is unpriceable', () => {
    const unpriceable: LpStoreOfferInput = { ...asteroOffer, requiredItemsCostPerRedemption: null };
    expect(cheapestLpOffer([unpriceable], 1)).toBeNull();
  });

  it('is null with no offers at all', () => {
    expect(cheapestLpOffer([], 1)).toBeNull();
  });

  it('still returns the cheapest option when the character cannot afford it', () => {
    const unaffordable: LpStoreOfferInput = { ...asteroOffer, playerLp: 0 };
    const result = cheapestLpOffer([unaffordable], 1);
    expect(result?.affordableLp).toBe(false);
    expect(result?.iskCost).toBe(850_000);
  });
});
