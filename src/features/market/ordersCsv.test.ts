import { describe, it, expect } from 'vitest';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { ordersCsvColumns } from './ordersCsv';

const t = (k: string, opts?: Record<string, unknown>) => (opts ? `${k}${JSON.stringify(opts)}` : k);

describe('ordersCsvColumns', () => {
  it('exports the order facts plus the fix list facts, in one row per OpenOrderRow', () => {
    const columns = ordersCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'orders.item',
      'orders.side',
      'orders.csvStation',
      'orders.csvCharacter',
      'orders.price',
      'orders.csvVolumeRemain',
      'orders.csvVolumeTotal',
      'orders.issued',
      'orders.expires',
      'orders.csvDaysLeft',
      'market.orders.floorLabel',
      'market.orders.fixList.colStationCheapest',
      'market.orders.fixList.colIskTiedUp',
      'market.orders.fixList.colProblem',
      'market.orders.fixList.colDoThis',
    ]);
  });

  it('exports station, character, expiry, days left and ISK tied up raw', () => {
    const row = openOrderRow({
      volumeRemain: 3,
      volumeTotal: 7,
      expiry: { expiresAt: Date.UTC(2026, 9, 1), daysLeft: 12, expired: false },
    });
    const values = Object.fromEntries(ordersCsvColumns(t).map((c) => [c.header, c.value(row)]));
    expect(values['orders.csvStation']).toBe('Jita IV - Moon 4');
    expect(values['orders.csvCharacter']).toBe('Alpha');
    expect(values['orders.csvVolumeRemain']).toBe(3);
    expect(values['orders.csvVolumeTotal']).toBe(7);
    expect(values['orders.expires']).toBe('2026-10-01T00:00:00.000Z');
    expect(values['orders.csvDaysLeft']).toBe(12);
    expect(values['market.orders.fixList.colIskTiedUp']).toBe(5000);
    expect(values['orders.side']).toBe('orders.sell');
  });

  it('leaves floor, station cheapest and expiry blank when unknown, never 0', () => {
    const row = openOrderRow({ floor: null, expiry: null });
    const values = Object.fromEntries(ordersCsvColumns(t).map((c) => [c.header, c.value(row)]));
    expect(values['market.orders.floorLabel']).toBeNull();
    expect(values['market.orders.fixList.colStationCheapest']).toBeNull();
    expect(values['orders.expires']).toBeNull();
    expect(values['orders.csvDaysLeft']).toBeNull();
  });

  it('translates side through orders.buy / orders.sell', () => {
    const side = ordersCsvColumns(t).find((c) => c.header === 'orders.side')!;
    expect(side.value(openOrderRow({ isBuyOrder: true }))).toBe('orders.buy');
    expect(side.value(openOrderRow({ isBuyOrder: false }))).toBe('orders.sell');
  });

  it('passes issued through unchanged as the raw ISO string', () => {
    const issued = ordersCsvColumns(t).find((c) => c.header === 'orders.issued')!;
    expect(issued.value(openOrderRow({ issued: '2026-08-25T00:00:00Z' }))).toBe(
      '2026-08-25T00:00:00Z'
    );
  });

  it('exports the rival price, the floor as shown and the problem and call in words', () => {
    const row = openOrderRow({
      price: 500,
      floor: { relist: 420.1, fill: 400 },
      station: { bestPrice: 490, beatsMe: true, gapIsk: 10, gapPct: 2 },
      problem: 'undercutStation',
      problems: ['undercutStation'],
    });
    const values = Object.fromEntries(ordersCsvColumns(t).map((c) => [c.header, c.value(row)]));
    expect(values['market.orders.fixList.colStationCheapest']).toBe(490);
    expect(values['market.orders.floorLabel']).toBe(420.1);
    expect(values['market.orders.fixList.colProblem']).toBe(
      'market.orders.badge.undercutStation -2.0%'
    );
    expect(values['market.orders.fixList.colDoThis']).toBe(
      'market.orders.fixList.doThis.undercutTo{"price":"489.90"}'
    );
  });
});
