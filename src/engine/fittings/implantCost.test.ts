import { describe, expect, it } from 'vitest';
import { costPerGain, orderBy } from './implantCost';

describe('costPerGain', () => {
  it('divides the cost by the gain', () => {
    expect(costPerGain(15_000_000, 7.5)).toBe(2_000_000);
  });

  it('is null without a price or a gain', () => {
    expect(costPerGain(null, 5)).toBeNull();
    expect(costPerGain(100, 0)).toBeNull();
    expect(costPerGain(100, -2)).toBeNull();
  });
});

describe('orderBy', () => {
  it('sorts ascending, keeps ties in their order and puts unknowns last', () => {
    const items = [
      { id: 'a', k: 3 },
      { id: 'b', k: null },
      { id: 'c', k: 1 },
      { id: 'd', k: 3 },
    ];
    expect(orderBy(items, (i) => i.k).map((i) => i.id)).toEqual(['c', 'a', 'd', 'b']);
  });
});
