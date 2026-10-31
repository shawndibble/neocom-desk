import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { variationsCsvColumns } from './variationsCsv';
import type { VariationRow } from './variations';

const t = (k: string) => k;

function row(overrides: Partial<VariationRow> = {}): VariationRow {
  return { typeId: 1, name: 'Rifter', tier: 'T1', ...overrides };
}

function summary(overrides: Partial<OrderBookSummary> = {}): OrderBookSummary {
  return { bestSell: 500, bestBuy: 400, spread: 100, availableVolume: 10, ...overrides };
}

const ctx = { selfName: 'Base', selfSummary: summary({ bestSell: 400 }), scopeName: 'Jita' };

describe('variationsCsvColumns', () => {
  it('orders columns name, tier, sell, buy, versus self (ISK, %), priced at', () => {
    const columns = variationsCsvColumns(t, new Map(), ctx);
    expect(columns.map((c) => c.header)).toEqual([
      'market.variations.name',
      'market.variations.tier',
      'market.variations.sell',
      'market.variations.buy',
      'market.variations.versus',
      'market.variations.versusPct',
      'market.variations.pricedAtColumn',
    ]);
  });

  it('emits raw numbers for best sell/buy, not formatted strings', () => {
    const prices = new Map([[1, summary({ bestSell: 12345.5, bestBuy: 12000 })]]);
    const columns = variationsCsvColumns(t, prices, ctx);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('12345.5');
    expect(fields[3]).toBe('12000');
  });

  it('exports an empty cell for a row with no resolved price', () => {
    const columns = variationsCsvColumns(t, new Map(), ctx);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });

  it('exports an empty cell for a side with no orders', () => {
    const prices = new Map([[1, summary({ bestSell: null, bestBuy: null })]]);
    const columns = variationsCsvColumns(t, prices, ctx);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });

  it('exports the best sell against the item varied, and where it is priced', () => {
    const columns = variationsCsvColumns(t, new Map([[1, summary({ bestSell: 500 })]]), ctx);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields.slice(4)).toEqual(['100', '25', '"Jita"']);
  });

  it('leaves the delta blank when either side has no sell price', () => {
    const columns = variationsCsvColumns(t, new Map(), ctx);
    const csv = toCsv([row({ typeId: 1 })], columns);
    expect(csv.split('\r\n')[1].split(',').slice(4, 6)).toEqual(['', '']);
  });
});
