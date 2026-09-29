import { describe, expect, it } from 'vitest';
import { ownedSaleCsvColumns } from './ownedSaleCsv';

const t = (k: string) => k;

describe('ownedSaleCsvColumns', () => {
  const columns = ownedSaleCsvColumns(t, (id) => `Item ${id}`);

  it('orders columns as the per-material table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.material',
      'industry.useOrSell.ownedUnits',
      'industry.unitPrice',
      'industry.useOrSell.netColumn',
    ]);
  });

  it('exports raw numbers', () => {
    const line = {
      typeID: 34,
      quantity: 1000,
      unitPrice: 5.25,
      gross: 5250,
      salesTax: 100,
      brokerFee: 0,
      net: 5150,
    };
    expect(columns.map((c) => c.value(line))).toEqual(['Item 34', 1000, 5.25, 5150]);
  });
});
