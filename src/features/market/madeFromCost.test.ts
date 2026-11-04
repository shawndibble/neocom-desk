import { describe, expect, it } from 'vitest';
import type { HubAggregate } from '@/market/prices';
import { marginOnBestSell, runInputCost } from './madeFromCost';

function aggregates(entries: Record<number, number | null>): Map<number, HubAggregate> {
  return new Map(
    Object.entries(entries).map(([typeId, sellMin]) => [
      Number(typeId),
      { sellMin, buyMax: null, sellVolume: 0, buyVolume: 0 },
    ])
  );
}

describe('runInputCost', () => {
  it('sums each input at its lowest sell price', () => {
    const cost = runInputCost(
      [
        { typeID: 34, quantity: 1000 },
        { typeID: 35, quantity: 200 },
      ],
      aggregates({ 34: 4, 35: 10.5 })
    );
    expect(cost).toBe(1000 * 4 + 200 * 10.5);
  });

  it('is null when any input has no sell price, rather than counting it as free', () => {
    expect(
      runInputCost(
        [
          { typeID: 34, quantity: 1000 },
          { typeID: 35, quantity: 200 },
        ],
        aggregates({ 34: 4, 35: null })
      )
    ).toBeNull();
    expect(runInputCost([{ typeID: 34, quantity: 1 }], new Map())).toBeNull();
  });
});

describe('marginOnBestSell', () => {
  it('is the profit over what a run sells for, in percent', () => {
    expect(marginOnBestSell(800, 100, 10)).toBe(20);
    expect(marginOnBestSell(1200, 100, 10)).toBe(-20);
  });

  it('is null with no best sell to compare against', () => {
    expect(marginOnBestSell(800, null, 10)).toBeNull();
    expect(marginOnBestSell(800, undefined, 10)).toBeNull();
    expect(marginOnBestSell(800, 0, 10)).toBeNull();
  });
});
