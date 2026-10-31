import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { HaulingViewRow } from './haulingView';
import { haulingCsvColumns } from './haulingCsv';

const t = (k: string) => k;

/** Only the fields the export reads; the rest of a scan row is irrelevant here. */
function row(overrides: Partial<HaulingViewRow> = {}): HaulingViewRow {
  return {
    mode: 'list',
    typeId: 34,
    name: 'Tritanium',
    buyLadder: [{ price: 4.5, volume: 1000 }],
    price: 5.25,
    sale: { price: 5.25, daysToSell: 2.4 },
    demand: { demand: 'most-days', daysWithTrades: 28 },
    marginPct: 12.345,
    iskPerM3: 40,
    flags: ['crowded', 'thin'],
    ...overrides,
  } as unknown as HaulingViewRow;
}

const options = {
  flagText: (flag: string) => `flag:${flag}`,
  bringFor: (r: HaulingViewRow) => (r.typeId === 34 ? 400 : null),
  profitFor: (r: HaulingViewRow) => (r.typeId === 34 ? 1500 : null),
  holdM3For: (r: HaulingViewRow) => (r.typeId === 34 ? 4 : null),
  addedFromFor: (r: HaulingViewRow) => (r.typeId === 34 ? 'Minerals' : null),
  selectedFor: (r: HaulingViewRow) => r.typeId === 34,
};

describe('haulingCsvColumns', () => {
  it('mirrors the table, plus profit, hold m³, added-from and the trip tick', () => {
    expect(haulingCsvColumns(t, options).map((c) => c.header)).toEqual([
      'market.hauling.columns.item',
      'market.hauling.columns.buy',
      'market.hauling.columns.expected',
      'market.hauling.columns.profit',
      'market.hauling.columns.margin',
      'market.hauling.columns.iskPerM3',
      'market.hauling.columns.m3',
      'market.hauling.columns.days',
      'market.hauling.columns.demand',
      'market.hauling.columns.flags',
      'market.hauling.columns.addedFromColumn',
      'market.hauling.columns.bring',
      'market.hauling.columns.onTripColumn',
    ]);
  });

  it('writes raw numbers and plain-text labels', () => {
    const csv = toCsv([row()], haulingCsvColumns(t, options));
    expect(csv.split('\r\n')[1]).toBe(
      '"Tritanium",4.5,5.25,1500,12.345,40,4,2.4,"market.hauling.demand.most-days","flag:crowded; flag:thin","Minerals",400,"common.exportFlagYes"'
    );
  });

  it('leaves buy empty with no origin listing and bring empty when not on the trip', () => {
    const csv = toCsv(
      [row({ typeId: 35, buyLadder: [], flags: [] })],
      haulingCsvColumns(t, options)
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Tritanium",,5.25,,12.345,40,,2.4,"market.hauling.demand.most-days",,,,"common.exportFlagNo"'
    );
  });

  it('selling into buy orders: the realised buy-order price, and no days or demand', () => {
    const columns = haulingCsvColumns(t, { ...options, mode: 'instant' });
    expect(columns.map((c) => c.header)).toEqual([
      'market.hauling.columns.item',
      'market.hauling.columns.buy',
      'market.hauling.columns.buyOrder',
      'market.hauling.columns.profit',
      'market.hauling.columns.margin',
      'market.hauling.columns.iskPerM3',
      'market.hauling.columns.m3',
      'market.hauling.columns.flags',
      'market.hauling.columns.addedFromColumn',
      'market.hauling.columns.bring',
      'market.hauling.columns.onTripColumn',
    ]);
    const csv = toCsv(
      [row({ mode: 'instant', price: 5.1, flags: [] } as Partial<HaulingViewRow>)],
      columns
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Tritanium",4.5,5.1,1500,12.345,40,4,,"Minerals",400,"common.exportFlagYes"'
    );
  });

  it('with Any hub at one end, names the hub each row uses there, after the item', () => {
    const columns = haulingCsvColumns(t, { ...options, anyEnd: 'from' });
    expect(columns.map((c) => c.header).slice(0, 3)).toEqual([
      'market.hauling.columns.item',
      'market.hauling.columns.hub',
      'market.hauling.columns.buy',
    ]);
    const csv = toCsv(
      [row({ fromHub: { systemName: 'Dodixie' } } as unknown as Partial<HaulingViewRow>)],
      columns
    );
    expect(csv.split('\r\n')[1]!.startsWith('"Tritanium","Dodixie",4.5')).toBe(true);
  });
});
