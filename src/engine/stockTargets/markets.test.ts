import { describe, expect, it } from 'vitest';
import { marketNeed, rankMarkets, type MarketSummary } from './markets';

const market = (over: Partial<MarketSummary> & { listId: string }): MarketSummary => ({
  items: 10,
  out: 0,
  low: 0,
  readyToList: 0,
  costToFill: 0,
  ...over,
});

describe('rankMarkets', () => {
  it('puts the market that needs the most attention first', () => {
    const ranked = rankMarkets([
      market({ listId: 'stocked' }),
      market({ listId: 'low-cheap', low: 3, costToFill: 10 }),
      market({ listId: 'out', out: 1 }),
      market({ listId: 'low-dear', low: 3, costToFill: 500 }),
      market({ listId: 'more-out', out: 2 }),
    ]);
    expect(ranked.map((m) => m.listId)).toEqual([
      'more-out',
      'out',
      'low-dear',
      'low-cheap',
      'stocked',
    ]);
  });
});

describe('marketNeed', () => {
  it('names the worst thing about a market', () => {
    expect(marketNeed(market({ listId: 'a', out: 2, low: 3 }))).toBe('out');
    expect(marketNeed(market({ listId: 'a', low: 3 }))).toBe('low');
    expect(marketNeed(market({ listId: 'a' }))).toBe('stocked');
  });
});
