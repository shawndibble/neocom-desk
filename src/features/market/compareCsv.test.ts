import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { compareCsvColumns } from './compareCsv';
import type { CompareRow } from './useCompareRows';

const t = (k: string) => k;

function summary(overrides: Partial<OrderBookSummary> = {}): OrderBookSummary {
  return { bestSell: 500, bestBuy: 400, spread: 100, availableVolume: 10, ...overrides };
}

function row(overrides: Partial<CompareRow> = {}): CompareRow {
  return { typeId: 1, itemName: 'Rifter', loading: false, summary: summary(), ...overrides };
}

describe('compareCsvColumns', () => {
  it('orders columns item, best sell, best buy, spread, volume', () => {
    const columns = compareCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'market.compare.columnItem',
      'market.compare.columnBestSell',
      'market.compare.columnBestBuy',
      'market.compare.columnSpread',
      'market.compare.columnVolume',
    ]);
  });

  it('emits raw numbers for price/spread/volume, not formatted strings', () => {
    const columns = compareCsvColumns(t);
    const csv = toCsv(
      [
        row({
          summary: summary({
            bestSell: 12345.5,
            bestBuy: 12000,
            spread: 345.5,
            availableVolume: 7,
          }),
        }),
      ],
      columns
    );
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields).toEqual(['Rifter', '12345.5', '12000', '345.5', '7']);
  });

  it('exports empty cells for a row still loading or whose fetch failed', () => {
    const columns = compareCsvColumns(t);
    const csv = toCsv([row({ loading: true, summary: null })], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields).toEqual(['Rifter', '', '', '', '']);
  });
});
