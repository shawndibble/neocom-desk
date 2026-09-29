import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import { scopeOrdersCsvColumns, type ScopeOrderCsvRow } from './scopeOrdersCsv';

const t = (k: string) => k;

const RIVAL: ScopeOrderCsvRow = {
  scope: 'Region',
  seller: 'Jita IV - Moon 4',
  price: 1234.5,
  gapIsk: 15.25,
  gapPct: 1.2,
  distance: '3 jumps',
};

const NOT_CHECKED: ScopeOrderCsvRow = {
  scope: 'System',
  seller: 'Not checked',
  price: null,
  gapIsk: null,
  gapPct: null,
  distance: null,
};

describe('scopeOrdersCsvColumns', () => {
  it('orders columns scope, seller, price, the gap as ISK and percent, distance', () => {
    expect(scopeOrdersCsvColumns(t).map((c) => c.header)).toEqual([
      'market.orders.scopeColumn',
      'market.orders.scopeCheapestSeller',
      'market.orders.scopeTheirPrice',
      'market.orders.scopeOverBy',
      'market.orders.scopeOverByPct',
      'market.orders.scopeDistance',
    ]);
  });

  it('splits the on-screen "ISK · %" gap into two raw numbers', () => {
    const csv = toCsv([RIVAL], scopeOrdersCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"Region","Jita IV - Moon 4",1234.5,15.25,1.2,"3 jumps"');
  });

  it('leaves the figures empty on a scope with no rival, its state in the seller column', () => {
    const csv = toCsv([NOT_CHECKED], scopeOrdersCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"System","Not checked",,,,');
  });
});
