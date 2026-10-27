import { describe, expect, it } from 'vitest';
import { fitAppraisalItems, fitSellPrice, type HubSides } from './fitSellPrice';

const sides = (sellMin: number | null, buyMax: number | null = null): HubSides => ({
  sellMin,
  buyMax,
});

describe('fitAppraisalItems', () => {
  it('turns item counts and hub prices into appraisal items, a missing price as null', () => {
    const items = fitAppraisalItems(
      [
        [626, 1],
        [2048, 2],
      ],
      new Map([[626, sides(10_000_000, 9_000_000)]])
    );
    expect(items).toEqual([
      { typeId: 626, name: '626', quantity: 1, buy: 9_000_000, sell: 10_000_000 },
      { typeId: 2048, name: '2048', quantity: 2, buy: null, sell: null },
    ]);
  });
});

describe('fitSellPrice', () => {
  it('sums count × sell price over every item', () => {
    const price = fitSellPrice(
      [
        [626, 1],
        [3001, 3],
        [500, 5],
      ],
      new Map([
        [626, sides(10_000_000)],
        [3001, sides(1_000_000)],
        [500, sides(200_000)],
      ])
    );
    expect(price).toEqual({ sell: 14_000_000, partial: false, unpricedTypes: 0 });
  });

  it('prices the rest and marks the total partial when an item has no sell order', () => {
    const price = fitSellPrice(
      [
        [626, 1],
        [3001, 2],
        [999, 4],
      ],
      new Map([
        [626, sides(10_000_000)],
        [3001, sides(1_000_000)],
        [999, sides(null, 50)],
      ])
    );
    expect(price).toEqual({ sell: 12_000_000, partial: true, unpricedTypes: 1 });
  });

  it('counts a type the hub returned nothing for as unpriced, never free', () => {
    const price = fitSellPrice(
      [
        [626, 1],
        [999, 1],
      ],
      new Map([[626, sides(10_000_000)]])
    );
    expect(price).toEqual({ sell: 10_000_000, partial: true, unpricedTypes: 1 });
  });

  it('is complete when every sell price is there, whatever the buy side says', () => {
    const price = fitSellPrice([[626, 1]], new Map([[626, sides(10_000_000, null)]]));
    expect(price?.partial).toBe(false);
  });

  it('has no price, rather than 0, when nothing has a sell order', () => {
    expect(fitSellPrice([[626, 1]], new Map([[626, sides(null, 9)]]))).toBeNull();
    expect(fitSellPrice([[626, 1]], new Map())).toBeNull();
  });

  it('has no price for a fit with no items', () => {
    expect(fitSellPrice([], new Map([[626, sides(1)]]))).toBeNull();
  });
});
