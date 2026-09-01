import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';
import { ordersCsvColumns, orderHistoryCsvColumns } from './ordersCsv';

const t = (k: string) => k;
const nameFor = (typeId: number) => `Item ${typeId}`;

function order(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 1,
    type_id: 100,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    price: 1000,
    volume_remain: 5,
    volume_total: 10,
    issued: '2026-08-20T12:00:00Z',
    duration: 90,
    range: 'station',
    ...overrides,
  };
}

describe('ordersCsvColumns', () => {
  it('orders columns item, side, price, volume remain, volume total, issued', () => {
    const columns = ordersCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'orders.item',
      'orders.side',
      'orders.price',
      'orders.csvVolumeRemain',
      'orders.csvVolumeTotal',
      'orders.issued',
    ]);
  });

  it('translates side through orders.buy / orders.sell', () => {
    const columns = ordersCsvColumns(t, nameFor);
    const sideColumn = columns.find((c) => c.header === 'orders.side')!;
    expect(sideColumn.value(order({ is_buy_order: true }))).toBe('orders.buy');
    expect(sideColumn.value(order({ is_buy_order: false }))).toBe('orders.sell');
  });

  it('splits remaining/total into two raw numeric columns', () => {
    const columns = ordersCsvColumns(t, nameFor);
    const row = order({ volume_remain: 3, volume_total: 7 });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('3');
    expect(fields[4]).toBe('7');
  });

  it('passes issued through unchanged as a raw ISO string', () => {
    const columns = ordersCsvColumns(t, nameFor);
    const issuedColumn = columns.find((c) => c.header === 'orders.issued')!;
    expect(issuedColumn.value(order({ issued: '2026-08-25T00:00:00Z' }))).toBe(
      '2026-08-25T00:00:00Z'
    );
  });
});

describe('orderHistoryCsvColumns', () => {
  it('appends a state column after the open-order columns', () => {
    const columns = orderHistoryCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'orders.item',
      'orders.side',
      'orders.price',
      'orders.csvVolumeRemain',
      'orders.csvVolumeTotal',
      'orders.issued',
      'orders.state',
    ]);
  });

  it('passes state through raw', () => {
    const columns = orderHistoryCsvColumns(t, nameFor);
    const stateColumn = columns.find((c) => c.header === 'orders.state')!;
    const row: MarketOrderHistory = { ...order(), state: 'expired' };
    expect(stateColumn.value(row)).toBe('expired');
  });
});
