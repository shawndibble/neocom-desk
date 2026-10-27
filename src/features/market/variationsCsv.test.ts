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

describe('variationsCsvColumns', () => {
  it('orders columns name, tier, sell, buy', () => {
    const columns = variationsCsvColumns(t, new Map());
    expect(columns.map((c) => c.header)).toEqual([
      'market.variations.name',
      'market.variations.tier',
      'market.variations.sell',
      'market.variations.buy',
    ]);
  });

  it('emits raw numbers for best sell/buy, not formatted strings', () => {
    const prices = new Map([[1, summary({ bestSell: 12345.5, bestBuy: 12000 })]]);
    const columns = variationsCsvColumns(t, prices);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('12345.5');
    expect(fields[3]).toBe('12000');
  });

  it('exports an empty cell for a row with no resolved price', () => {
    const columns = variationsCsvColumns(t, new Map());
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });

  it('exports an empty cell for a side with no orders', () => {
    const prices = new Map([[1, summary({ bestSell: null, bestBuy: null })]]);
    const columns = variationsCsvColumns(t, prices);
    const csv = toCsv([row({ typeId: 1 })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });
});
