import { describe, expect, it } from 'vitest';
import {
  buildStockRows,
  LOW_FILL_RATIO,
  splitForBuilders,
  stockStatus,
  summarizeStock,
  type StockRow,
} from './stockRows';

describe('stockStatus', () => {
  it('is out when nothing is on hand', () => {
    expect(stockStatus(0, 40)).toBe('out');
  });

  it('is low below half the Stock Target', () => {
    expect(LOW_FILL_RATIO).toBe(0.5);
    expect(stockStatus(19, 40)).toBe('low');
  });

  it('is ok from half up to the Stock Target itself', () => {
    expect(stockStatus(20, 40)).toBe('ok');
    expect(stockStatus(40, 40)).toBe('ok');
  });

  it('is over past the Stock Target', () => {
    expect(stockStatus(41, 40)).toBe('over');
  });
});

describe('buildStockRows', () => {
  it('works out shortfall, fill and cost to fill per row', () => {
    const [row] = buildStockRows([{ typeId: 1, target: 800, onHand: 120, price: 6000 }]);
    expect(row).toEqual<StockRow>({
      typeId: 1,
      target: 800,
      onHand: 120,
      shortfall: 680,
      fill: 0.15,
      status: 'low',
      price: 6000,
      costToFill: 4_080_000,
    });
  });

  it('has no shortfall or cost once the Stock Target is met', () => {
    const [row] = buildStockRows([{ typeId: 1, target: 25, onHand: 31, price: 1_400_000 }]);
    expect(row.shortfall).toBe(0);
    expect(row.costToFill).toBe(0);
    expect(row.status).toBe('over');
  });

  it('leaves cost to fill unknown, not zero, when a short item has no price', () => {
    const [row] = buildStockRows([{ typeId: 1, target: 10, onHand: 0, price: null }]);
    expect(row.costToFill).toBeNull();
  });

  it('sorts worst first: out, low, ok, over, then dearest shortfall within a status', () => {
    const rows = buildStockRows([
      { typeId: 1, target: 10, onHand: 12, price: 1 }, // over
      { typeId: 2, target: 100, onHand: 90, price: 1 }, // ok, cost 10
      { typeId: 3, target: 100, onHand: 10, price: 1 }, // low, cost 90
      { typeId: 4, target: 100, onHand: 10, price: 5 }, // low, cost 450
      { typeId: 5, target: 10, onHand: 0, price: null }, // out, unpriced
      { typeId: 6, target: 10, onHand: 0, price: 1 }, // out, cost 10
    ]);
    expect(rows.map((r) => r.typeId)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('drops a row with no usable Stock Target', () => {
    expect(buildStockRows([{ typeId: 1, target: 0, onHand: 5, price: 1 }])).toEqual([]);
  });
});

describe('summarizeStock', () => {
  it('counts each status and totals the known cost to fill', () => {
    const rows = buildStockRows([
      { typeId: 1, target: 10, onHand: 0, price: 2 },
      { typeId: 2, target: 10, onHand: 0, price: null },
      { typeId: 3, target: 10, onHand: 2, price: 3 },
      { typeId: 4, target: 10, onHand: 10, price: 3 },
      { typeId: 5, target: 10, onHand: 11, price: 3 },
    ]);
    expect(summarizeStock(rows)).toEqual({
      out: 2,
      low: 1,
      ok: 1,
      over: 1,
      costToFill: 20 + 24,
      unpricedShort: 1,
    });
  });
});

describe('splitForBuilders', () => {
  const rows = buildStockRows([
    { typeId: 1, target: 10, onHand: 0, price: 1 },
    { typeId: 2, target: 10, onHand: 2, price: 1 },
    { typeId: 3, target: 10, onHand: 10, price: 1 },
  ]);

  it('puts short rows the pilot holds a blueprint for under buildable, the rest under needs', () => {
    const split = splitForBuilders(rows, (typeId) => typeId === 2);
    expect(split.buildable.map((r) => r.typeId)).toEqual([2]);
    expect(split.needsBlueprintOrBuy.map((r) => r.typeId)).toEqual([1]);
  });

  it('leaves rows that are not short out of both lists', () => {
    const split = splitForBuilders(rows, () => true);
    expect(split.buildable.map((r) => r.typeId)).toEqual([1, 2]);
    expect(split.needsBlueprintOrBuy).toEqual([]);
  });
});
