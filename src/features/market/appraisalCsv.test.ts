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
    expect(
      appraisalCsvColumns(t)
        .map((c) => c.header)
        .slice(0, 9)
    ).toEqual([
      'market.appraisal.columnQuantity',
      'market.appraisal.columnItem',
      'market.appraisal.columnBuyEach',
      'market.appraisal.columnSellEach',
      'market.appraisal.columnSplitEach',
      'market.appraisal.columnBuyTotal',
      'market.appraisal.columnSellTotal',
      'market.appraisal.columnVolume',
      'market.appraisal.columnIskPerM3',
    ]);
  });

  it('emits raw numbers, not formatted strings', () => {
    const csv = toCsv(
      [row({ buyEach: 4.869, buyTotal: 606190.5, volume: 1.5 })],
      appraisalCsvColumns(t)
    );
    const fields = csv.split('\r\n')[1].split(',').slice(0, 9);
    expect(fields).toEqual([
      '100',
      '"Tritanium"',
      '4.869',
      '6',
      '5.4345',
      '606190.5',
      '600',
      '1.5',
      '400',
    ]);
  });

  it('exports an unpriced side empty rather than as zero', () => {
    const csv = toCsv([row({ buyEach: null, buyTotal: null })], appraisalCsvColumns(t));
    const fields = csv.split('\r\n')[1].split(',').slice(0, 9);
    expect(fields).toEqual(['100', '"Tritanium"', '', '6', '', '', '600', '', '']);
  });

  it('exports an unknown volume empty rather than as zero', () => {
    const csv = toCsv([row({ volume: null })], appraisalCsvColumns(t));
    expect(csv.split('\r\n')[1].split(',')[7]).toBe('');
  });

  it('exports split each as a raw number, empty when a side is unpriced', () => {
    const split = appraisalCsvColumns(t).find(
      (c) => c.header === 'market.appraisal.columnSplitEach'
    );
    expect(split?.value(row())).toBe(5.5);
    expect(split?.value(row({ buyEach: null }))).toBeNull();
  });

  it('exports ISK per m³ as a raw number, empty when there is no volume', () => {
    const iskPerM3Column = appraisalCsvColumns(t).find(
      (c) => c.header === 'market.appraisal.columnIskPerM3'
    );
    expect(iskPerM3Column?.value(row({ sellTotal: 600, volume: 3 }))).toBe(200);
    expect(iskPerM3Column?.value(row({ volume: null }))).toBeNull();
  });

  const at = (
    header: string,
    r: Parameters<ReturnType<typeof appraisalCsvColumns>[number]['value']>[0],
    fees?: Parameters<typeof appraisalCsvColumns>[1]
  ) =>
    appraisalCsvColumns(t, fees)
      .find((c) => c.header === header)
      ?.value(r);

  it('exports refine, LP store, owned and need, blank where the row has none', () => {
    const full = row({ refineTotal: 900, lpIskCost: 100, lpCost: 2000, lpCorpName: 'Corp' });
    expect(at('market.appraisal.columnRefineTotal', full)).toBe(900);
    expect(at('market.appraisal.columnLpTotal', full)).toBe(100);
    expect(at('market.appraisal.columnLpCost', full)).toBe(2000);
    expect(at('market.appraisal.columnLpCorp', full)).toBe('Corp');
    expect(at('market.appraisal.columnRefineTotal', row())).toBeUndefined();
    expect(at('market.appraisal.columnNeed', { ...row(), need: 30, owned: 70 })).toBe(30);
    expect(at('market.appraisal.columnOwned', { ...row(), need: 30, owned: 70 })).toBe(70);
    expect(at('market.appraisal.columnOwned', row())).toBeUndefined();
  });

  it('names a cached or failed price, and leaves a live one blank', () => {
    expect(at('market.appraisal.columnPriceState', row({ priceState: 'cached' }))).toBe(
      'market.appraisal.live.markCached'
    );
    expect(at('market.appraisal.columnPriceState', row({ priceState: 'failed' }))).toBe(
      'market.appraisal.live.markFailed'
    );
    expect(at('market.appraisal.columnPriceState', row({ priceState: 'live' }))).toBeNull();
  });

  it('adds the fee columns only where the view has a fee context, blank until skills load', () => {
    const headers = (fees?: Parameters<typeof appraisalCsvColumns>[1]) =>
      appraisalCsvColumns(t, fees).map((c) => c.header);
    expect(headers()).not.toContain('market.appraisal.columnSalesTax');
    expect(headers({ fees: null })).toContain('market.appraisal.columnSalesTax');
    expect(at('market.appraisal.columnSalesTax', row(), { fees: null })).toBeNull();
    const fees = {
      fees: {
        accountingLevel: 0,
        brokerRelationsLevel: 0,
        standing: { factionStanding: 0, corpStanding: 0 },
      },
    };
    expect(at('market.appraisal.columnSalesTax', row(), fees)).toBeGreaterThan(0);
    expect(at('market.appraisal.columnSellAfterFees', row(), fees)).toBeLessThan(600);
    expect(at('market.appraisal.columnSalesTax', row({ sellTotal: null }), fees)).toBeNull();
  });
});
