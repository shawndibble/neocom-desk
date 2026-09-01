import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import { assetCsvRows, assetsCsvColumns } from './assetsCsv';

const t = (k: string) => k;

describe('assetCsvRows', () => {
  it('flattens groups into rows, preserving group and within-group order', () => {
    const groups = [
      {
        label: 'Jita IV - Moon 4',
        entries: [
          { name: 'Tritanium', quantity: 100 },
          { name: 'Veldspar', quantity: 50 },
        ],
      },
      { label: 'Amarr VIII', entries: [{ name: 'Rifter', quantity: 1 }] },
    ];
    expect(assetCsvRows(groups)).toEqual([
      { location: 'Jita IV - Moon 4', name: 'Tritanium', quantity: 100 },
      { location: 'Jita IV - Moon 4', name: 'Veldspar', quantity: 50 },
      { location: 'Amarr VIII', name: 'Rifter', quantity: 1 },
    ]);
  });

  it('returns an empty array for no groups', () => {
    expect(assetCsvRows([])).toEqual([]);
  });
});

describe('assetsCsvColumns', () => {
  it('orders columns location, item, quantity', () => {
    const columns = assetsCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'assets.csvLocation',
      'assets.csvItem',
      'assets.csvQuantity',
    ]);
  });

  it('emits a raw number for quantity', () => {
    const columns = assetsCsvColumns(t);
    const row = { location: 'Jita', name: 'Tritanium', quantity: 12345 };
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('12345');
  });
});
