import { describe, it, expect } from 'vitest';
import { openOrderRow } from '@/features/market/__fixtures__/openOrderRow';
import { ordersCsvColumns } from './ordersCsv';

const t = (k: string) => k;

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
      'orders.csvFloor',
      'orders.csvStationCheapest',
      'orders.csvIskTiedUp',
      'orders.csvProblem',
      'orders.csvDoThis',
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
    expect(values['orders.csvIskTiedUp']).toBe(5000);
    expect(values['orders.side']).toBe('orders.sell');
  });

  it('leaves floor, station cheapest and expiry blank when unknown, never 0', () => {
    const row = openOrderRow({ floor: null, expiry: null });
    const values = Object.fromEntries(ordersCsvColumns(t).map((c) => [c.header, c.value(row)]));
    expect(values['orders.csvFloor']).toBeNull();
    expect(values['orders.csvStationCheapest']).toBeNull();
    expect(values['orders.expires']).toBeNull();
    expect(values['orders.csvDaysLeft']).toBeNull();
  });

  it('exports the rival price, the floor and the call when a rival beats the order', () => {
    const row = openOrderRow({
      price: 500,
      floor: { relist: 420.1, fill: 400 },
      station: { bestPrice: 490, beatsMe: true, gapIsk: 10, gapPct: 2 },
      problem: 'undercutStation',
      problems: ['undercutStation'],
    });
    const values = Object.fromEntries(ordersCsvColumns(t).map((c) => [c.header, c.value(row)]));
    expect(values['orders.csvStationCheapest']).toBe(490);
    expect(values['orders.csvFloor']).toBeGreaterThanOrEqual(420.1);
    expect(typeof values['orders.csvProblem']).toBe('string');
    expect(typeof values['orders.csvDoThis']).toBe('string');
  });
});
