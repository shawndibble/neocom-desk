import { describe, expect, it } from 'vitest';
import {
  buildStockRows,
  LOW_FILL_RATIO,
  splitForBuilders,
  stockStatus,
  summarizeStock,
  type StockRow,
  type StockRowInput,
} from './stockRows';

const input = (over: Partial<StockRowInput> & { typeId: number }): StockRowInput => ({
  target: 10,
  listed: 0,
  inHangar: 0,
  price: 1,
  ...over,
});

describe('stockStatus', () => {
  it('is out when nothing is listed', () => {
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
  it('splits the Shortfall into what the hangar covers and what must be bought or built', () => {
    const [row] = buildStockRows([
      { typeId: 1, target: 800, listed: 120, inHangar: 300, price: 6000 },
    ]);
    expect(row).toEqual<StockRow>({
      typeId: 1,
      target: 800,
      listed: 120,
      inHangar: 300,
      price: 6000,
      shortfall: 680,
      fromHangar: 300,
      toSource: 380,
      fill: 0.15,
      status: 'low',
      costToFill: 2_280_000,
    });
  });

  it('measures status by what is listed, however much sits in the hangar', () => {
    const [row] = buildStockRows([input({ typeId: 1, target: 40, listed: 0, inHangar: 500 })]);
    expect(row.status).toBe('out');
    expect(row.fromHangar).toBe(40);
    expect(row.toSource).toBe(0);
    expect(row.costToFill).toBe(0);
  });

  it('has no shortfall or cost once the Stock Target is met', () => {
    const [row] = buildStockRows([input({ typeId: 1, target: 25, listed: 31, inHangar: 4 })]);
    expect(row.shortfall).toBe(0);
    expect(row.fromHangar).toBe(0);
    expect(row.costToFill).toBe(0);
    expect(row.status).toBe('over');
  });

  it('leaves cost to fill unknown, not zero, when something must be sourced and has no price', () => {
    const [row] = buildStockRows([input({ typeId: 1, price: null })]);
    expect(row.costToFill).toBeNull();
  });

  it('sorts worst first: out, low, ok, over, then dearest cost within a status', () => {
    const rows = buildStockRows([
      input({ typeId: 1, target: 10, listed: 12 }), // over
      input({ typeId: 2, target: 100, listed: 90 }), // ok, cost 10
      input({ typeId: 3, target: 100, listed: 10 }), // low, cost 90
      input({ typeId: 4, target: 100, listed: 10, price: 5 }), // low, cost 450
      input({ typeId: 5, price: null }), // out, unpriced
      input({ typeId: 6 }), // out, cost 10
    ]);
    expect(rows.map((r) => r.typeId)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('drops a row with no usable Stock Target', () => {
    expect(buildStockRows([input({ typeId: 1, target: 0, listed: 5 })])).toEqual([]);
  });
});

describe('summarizeStock', () => {
  it('counts each status, the items ready to list, and totals the known cost to fill', () => {
    const rows = buildStockRows([
      input({ typeId: 1, price: 2 }),
      input({ typeId: 2, price: null }),
      input({ typeId: 3, listed: 2, inHangar: 5, price: 3 }),
      input({ typeId: 4, listed: 10, price: 3 }),
      input({ typeId: 5, listed: 11, price: 3 }),
    ]);
    expect(summarizeStock(rows)).toEqual({
      out: 2,
      low: 1,
      ok: 1,
      over: 1,
      readyToList: 1,
      costToFill: 20 + 9,
      unpricedShort: 1,
    });
  });
});

describe('splitForBuilders', () => {
  const rows = buildStockRows([
    input({ typeId: 1 }),
    input({ typeId: 2, listed: 2 }),
    input({ typeId: 3, listed: 10 }),
    input({ typeId: 4, listed: 0, inHangar: 10 }),
  ]);

  it('puts rows still to source that the pilot holds a blueprint for under buildable', () => {
    const split = splitForBuilders(rows, (typeId) => typeId === 2);
    expect(split.buildable.map((r) => r.typeId)).toEqual([2]);
    expect(split.needsBlueprintOrBuy.map((r) => r.typeId)).toEqual([1]);
  });

  it('leaves rows the listings or the hangar already cover out of both lists', () => {
    const split = splitForBuilders(rows, () => true);
    expect(split.buildable.map((r) => r.typeId)).toEqual([1, 2]);
    expect(split.needsBlueprintOrBuy).toEqual([]);
  });
});
