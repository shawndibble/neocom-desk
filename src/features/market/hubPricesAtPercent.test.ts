import { describe, expect, it } from 'vitest';
import { scaleHubPrices } from './hubPricesAtPercent';

describe('scaleHubPrices', () => {
  it('scales the sell and buy price, keeps the volumes and a missing side', () => {
    const prices = new Map([[34, { sellMin: 10, buyMax: null, sellVolume: 5, buyVolume: 0 }]]);
    expect(scaleHubPrices(prices, 90).get(34)).toEqual({
      sellMin: 9,
      buyMax: null,
      sellVolume: 5,
      buyVolume: 0,
    });
  });

  it('hands back the same map at 100%', () => {
    const prices = new Map([[34, { sellMin: 10, buyMax: 8 }]]);
    expect(scaleHubPrices(prices, 100)).toBe(prices);
  });
});
