import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { AppraisalRow } from '@/engine/market/appraisal';
import { appraisalCsvColumns } from './appraisalCsv';

const t = (k: string) => k;

function row(overrides: Partial<AppraisalRow> = {}): AppraisalRow {
  return {
    typeId: 34,
    name: 'Tritanium',
    quantity: 100,
    buyEach: 5,
    sellEach: 6,
    buyTotal: 500,
    sellTotal: 600,
    volume: null,
    ...overrides,
  };
}

describe('appraisalCsvColumns', () => {
  it('orders columns quantity, item, then each side each-and-total', () => {
    expect(appraisalCsvColumns(t).map((c) => c.header)).toEqual([
      'market.appraisal.columnQuantity',
      'market.appraisal.columnItem',
      'market.appraisal.columnBuyEach',
      'market.appraisal.columnSellEach',
      'market.appraisal.columnBuyTotal',
      'market.appraisal.columnSellTotal',
      'market.appraisal.columnVolume',
    ]);
  });

  it('emits raw numbers, not formatted strings', () => {
    const csv = toCsv(
      [row({ buyEach: 4.869, buyTotal: 606190.5, volume: 1.5 })],
      appraisalCsvColumns(t)
    );
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields).toEqual(['100', '"Tritanium"', '4.869', '6', '606190.5', '600', '1.5']);
  });

  it('exports an unpriced side empty rather than as zero', () => {
    const csv = toCsv([row({ buyEach: null, buyTotal: null })], appraisalCsvColumns(t));
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields).toEqual(['100', '"Tritanium"', '', '6', '', '600', '']);
  });

  it('exports an unknown volume empty rather than as zero', () => {
    const csv = toCsv([row({ volume: null })], appraisalCsvColumns(t));
    expect(csv.split('\r\n')[1].split(',').at(-1)).toBe('');
  });
});
