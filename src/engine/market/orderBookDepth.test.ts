import { describe, expect, it } from 'vitest';
import { bookDepth, priceComparison, sellOutlierMultiple, sortBookSide } from './orderBookDepth';

const order = (order_id: number, price: number, volume_remain: number) => ({
  order_id,
  price,
  volume_remain,
});

describe('bookDepth', () => {
  it('totals units and ISK from the best order down to each row, in the order given', () => {
    const depth = bookDepth([order(1, 358_000, 69), order(2, 358_100, 477), order(3, 358_300, 10)]);
    expect(depth.get(1)).toEqual({ units: 69, isk: 24_702_000 });
    expect(depth.get(2)).toEqual({ units: 546, isk: 195_515_700 });
    expect(depth.get(3)).toEqual({ units: 556, isk: 199_098_700 });
  });
});

describe('sortBookSide', () => {
  const at = (order_id: number, price: number, system_id: number) => ({
    order_id,
    price,
    volume_remain: 1,
    system_id,
  });
  const jumps = new Map([
    [10, 4],
    [20, 0],
    [30, 2],
  ]);
  const distance = (systemId: number) => jumps.get(systemId) ?? null;

  it('puts the cheapest sell first and breaks a price tie by distance, nearest first', () => {
    const sorted = sortBookSide(
      [at(1, 550_000, 10), at(2, 564_900, 30), at(3, 550_000, 20)],
      'sell',
      distance
    );
    expect(sorted.map((o) => o.order_id)).toEqual([3, 1, 2]);
  });

  it('puts the highest buy first, and a tied order with no known distance after the measured ones', () => {
    const sorted = sortBookSide(
      [at(1, 2_600, 99), at(2, 2_600, 30), at(3, 9_000, 10)],
      'buy',
      distance
    );
    expect(sorted.map((o) => o.order_id)).toEqual([3, 2, 1]);
  });
});

describe('sellOutlierMultiple', () => {
  it('names how many times the best sell a bait order asks, once it is ten times or more', () => {
    expect(sellOutlierMultiple(567_100_000, 550_000)).toBeCloseTo(1031.09, 2);
    expect(sellOutlierMultiple(5_500_000, 550_000)).toBe(10);
  });

  it('leaves an ordinary or merely pricey order unflagged', () => {
    expect(sellOutlierMultiple(694_000, 550_000)).toBeNull();
    expect(sellOutlierMultiple(5_499_999, 550_000)).toBeNull();
  });

  it('flags nothing when there is no best sell to measure against', () => {
    expect(sellOutlierMultiple(1_000, null)).toBeNull();
    expect(sellOutlierMultiple(1_000, 0)).toBeNull();
  });
});

describe('priceComparison', () => {
  it("states the hub's best against the best in range, signed, with the fraction of the range price", () => {
    expect(priceComparison(550_000, 358_000)).toEqual({
      delta: -192_000,
      ratio: -192_000 / 550_000,
    });
    expect(priceComparison(300_000, 330_000)).toEqual({ delta: 30_000, ratio: 0.1 });
  });

  it('has nothing to compare when either side has no price', () => {
    expect(priceComparison(null, 358_000)).toBeNull();
    expect(priceComparison(550_000, null)).toBeNull();
  });
});
