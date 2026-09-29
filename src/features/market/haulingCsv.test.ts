import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { HaulingViewRow } from './haulingView';
import { haulingCsvColumns } from './haulingCsv';

const t = (k: string) => k;

/** Only the fields the export reads; the rest of a scan row is irrelevant here. */
function row(overrides: Partial<HaulingViewRow> = {}): HaulingViewRow {
  return {
    typeId: 34,
    name: 'Tritanium',
    buyLadder: [{ price: 4.5, volume: 1000 }],
    sale: { price: 5.25, daysToSell: 2.4 },
    demand: { demand: 'most-days', daysWithTrades: 28 },
    marginPct: 12.345,
    flags: ['crowded', 'thin'],
    ...overrides,
  } as unknown as HaulingViewRow;
}

const options = {
  flagText: (flag: string) => `flag:${flag}`,
  bringFor: (r: HaulingViewRow) => (r.typeId === 34 ? 400 : null),
};

describe('haulingCsvColumns', () => {
  it('mirrors the table: item, buy, sell, margin, days, demand, heads up, bring', () => {
    expect(haulingCsvColumns(t, options).map((c) => c.header)).toEqual([
      'market.hauling.columns.item',
      'market.hauling.columns.buy',
      'market.hauling.columns.expected',
      'market.hauling.columns.margin',
      'market.hauling.columns.days',
      'market.hauling.columns.demand',
      'market.hauling.columns.flags',
      'market.hauling.columns.bring',
    ]);
  });

  it('writes raw numbers and plain-text labels', () => {
    const csv = toCsv([row()], haulingCsvColumns(t, options));
    expect(csv.split('\r\n')[1]).toBe(
      '"Tritanium",4.5,5.25,12.345,2.4,"market.hauling.demand.most-days","flag:crowded; flag:thin",400'
    );
  });

  it('leaves buy empty with no origin listing and bring empty when not on the trip', () => {
    const csv = toCsv(
      [row({ typeId: 35, buyLadder: [], flags: [] })],
      haulingCsvColumns(t, options)
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Tritanium",,5.25,12.345,2.4,"market.hauling.demand.most-days",,'
    );
  });
});
