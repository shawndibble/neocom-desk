import { describe, expect, it } from 'vitest';
import { lpRedemptionOffer, marketSellOffer, turnInCost } from './blueprintPurchaseOffers';

const noneOwned = () => 0;

describe('lpRedemptionOffer', () => {
  it('prices a redemption with no turn-ins at its ISK/LP price, as an unresearched copy', () => {
    expect(
      lpRedemptionOffer({ quantity: 1, requiredItems: [] }, 5_000, () => undefined, noneOwned)
    ).toEqual({ me: 0, te: 0, runs: 1, quantity: 1, price: 5_000 });
  });

  it('adds turn-in items at their hub price', () => {
    const offer = lpRedemptionOffer(
      { quantity: 1, requiredItems: [{ typeId: 34, quantity: 3 }] },
      1_000,
      (typeId) => (typeId === 34 ? 200 : undefined),
      noneOwned
    );
    expect(offer?.price).toBe(1_600);
  });

  it('charges nothing for turn-ins the pilot already owns, only for what is still to buy', () => {
    const owned = (typeId: number) => (typeId === 34 ? 2 : 0);
    const offer = lpRedemptionOffer(
      { quantity: 1, requiredItems: [{ typeId: 34, quantity: 3 }] },
      1_000,
      () => 200,
      owned
    );
    expect(offer?.price).toBe(1_200);
  });

  it('needs no hub price for a turn-in the pilot owns enough of', () => {
    const offer = lpRedemptionOffer(
      { quantity: 1, requiredItems: [{ typeId: 34, quantity: 3 }] },
      1_000,
      () => undefined,
      () => 5
    );
    expect(offer?.price).toBe(1_000);
  });

  it('is no offer when a turn-in still to buy has no hub price — never cheaper than it is', () => {
    expect(
      lpRedemptionOffer(
        { quantity: 1, requiredItems: [{ typeId: 34, quantity: 3 }] },
        1_000,
        () => undefined,
        noneOwned
      )
    ).toBeNull();
  });

  it('carries the copies one redemption hands over', () => {
    expect(
      lpRedemptionOffer({ quantity: 4, requiredItems: [] }, 10, () => undefined, noneOwned)
    ).toMatchObject({ quantity: 4 });
  });
});

describe('turnInCost', () => {
  it('is 0 with no turn-ins', () => {
    expect(turnInCost([], () => undefined, noneOwned)).toBe(0);
  });

  it('prices only the units still to buy', () => {
    expect(
      turnInCost(
        [
          { typeId: 34, quantity: 3 },
          { typeId: 35, quantity: 1 },
        ],
        (typeId) => (typeId === 34 ? 200 : 50),
        (typeId) => (typeId === 34 ? 1 : 5)
      )
    ).toBe(400);
  });

  it('is null when a unit still to buy has no price', () => {
    expect(turnInCost([{ typeId: 34, quantity: 1 }], () => undefined, noneOwned)).toBeNull();
  });
});

describe('marketSellOffer', () => {
  it('turns a sell price into an ME0 original', () => {
    expect(marketSellOffer(7_500)).toEqual({ me: 0, te: 0, runs: -1, quantity: 1, price: 7_500 });
  });

  it('is no offer without a sell price', () => {
    expect(marketSellOffer(null)).toBeNull();
    expect(marketSellOffer(0)).toBeNull();
  });
});
