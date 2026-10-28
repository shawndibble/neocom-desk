import { describe, expect, it } from 'vitest';
import { INPUT_COST_MOVE_MIN_PCT, inputCostMove } from './inputCostMove';
import type { OpenPricePoint } from './priceHistoryOpen';

/** Eight daily points ending 2026-10-08: `first` on the 1st, `last` on the rest. */
function line(first: number, last: number, side: 'buy' | 'sell' = 'sell') {
  const points: OpenPricePoint[] = [];
  for (let d = 1; d <= 8; d++) {
    const v = d === 1 ? first : last;
    points.push({
      date: `2026-10-0${d}`,
      buy: side === 'buy' ? v : null,
      sell: side === 'sell' ? v : null,
    });
  }
  return points;
}

describe('inputCostMove', () => {
  it('reports the cost move, the biggest input and the product move', () => {
    const move = inputCostMove({
      inputs: [
        { typeID: 34, quantity: 100, lineCost: 100 },
        { typeID: 35, quantity: 100, lineCost: 100 },
      ],
      series: new Map([
        [34, line(10, 12)],
        [35, line(10, 10)],
        [999, line(100, 101)],
      ]),
      materialSide: 'sell',
      product: { typeID: 999, side: 'sell' },
    });
    // 2000 -> 2200: +10%. Input 34 is 1200 of 2200.
    expect(move?.costPct).toBeCloseTo(10);
    expect(move?.topInput.typeID).toBe(34);
    expect(move?.topInput.sharePct).toBeCloseTo((1200 / 2200) * 100);
    expect(move?.productPct).toBeCloseTo(1);
  });

  it('hides the line under the threshold, shows a fall', () => {
    expect(INPUT_COST_MOVE_MIN_PCT).toBe(5);
    expect(
      inputCostMove({
        inputs: [{ typeID: 34, quantity: 1, lineCost: 100 }],
        series: new Map([[34, line(100, 104)]]),
        materialSide: 'sell',
        product: null,
      })
    ).toBeNull();
    const fell = inputCostMove({
      inputs: [{ typeID: 34, quantity: 1, lineCost: 100 }],
      series: new Map([[34, line(100, 90)]]),
      materialSide: 'sell',
      product: null,
    });
    expect(fell?.costPct).toBeCloseTo(-10);
  });

  it('reads the chosen side only', () => {
    expect(
      inputCostMove({
        inputs: [{ typeID: 34, quantity: 1, lineCost: 100 }],
        series: new Map([[34, line(100, 120, 'sell')]]),
        materialSide: 'buy',
        product: null,
      })
    ).toBeNull();
  });

  it('skips an input with no history, hides when none has any', () => {
    const move = inputCostMove({
      inputs: [
        { typeID: 34, quantity: 1, lineCost: 100 },
        { typeID: 35, quantity: 1, lineCost: 10 },
      ],
      series: new Map([[34, line(100, 120)]]),
      materialSide: 'sell',
      product: null,
    });
    expect(move?.costPct).toBeCloseTo(20);
    expect(move?.topInput.sharePct).toBeCloseTo(100);
    expect(move?.productPct).toBeNull();
    expect(
      inputCostMove({
        inputs: [{ typeID: 35, quantity: 1, lineCost: 100 }],
        series: new Map(),
        materialSide: 'sell',
        product: null,
      })
    ).toBeNull();
  });

  it('hides when the priced inputs are a sliver of the plan cost', () => {
    expect(
      inputCostMove({
        inputs: [
          { typeID: 34, quantity: 1, lineCost: 10 },
          { typeID: 35, quantity: 1, lineCost: 90 },
        ],
        series: new Map([[34, line(100, 120)]]),
        materialSide: 'sell',
        product: null,
      })
    ).toBeNull();
  });

  it('needs a base day 7 days back', () => {
    expect(
      inputCostMove({
        inputs: [{ typeID: 34, quantity: 1, lineCost: 100 }],
        series: new Map([[34, line(100, 120).slice(3)]]),
        materialSide: 'sell',
        product: null,
      })
    ).toBeNull();
  });

  it('ignores zero-quantity inputs', () => {
    expect(
      inputCostMove({
        inputs: [{ typeID: 34, quantity: 0, lineCost: 100 }],
        series: new Map([[34, line(100, 120)]]),
        materialSide: 'sell',
        product: null,
      })
    ).toBeNull();
  });
});
