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
          { name: 'Tritanium', quantity: 100, nickname: '' },
          { name: 'Veldspar', quantity: 50, nickname: '' },
        ],
      },
      {
        label: 'Amarr VIII',
        nickname: 'Home market',
        entries: [{ name: 'Rifter', quantity: 1 }],
      },
    ];
    expect(assetCsvRows(groups)).toEqual([
      { location: 'Jita IV - Moon 4', name: 'Tritanium', quantity: 100, nickname: '' },
      { location: 'Jita IV - Moon 4', name: 'Veldspar', quantity: 50, nickname: '' },
      { location: 'Amarr VIII', name: 'Rifter', quantity: 1, nickname: 'Home market' },
    ]);
  });

  it('returns an empty array for no groups', () => {
    expect(assetCsvRows([])).toEqual([]);
  });
});

describe('assetsCsvColumns', () => {
  it('orders columns location, item, quantity, nickname (real name column unchanged)', () => {
    const columns = assetsCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'assets.csvLocation',
      'assets.csvItem',
      'assets.csvQuantity',
      'assets.csvNickname',
    ]);
  });

  it('emits a raw number for quantity', () => {
    const columns = assetsCsvColumns(t);
    const row = { location: 'Jita', name: 'Tritanium', quantity: 12345, nickname: '' };
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[2]).toBe('12345');
  });
});
