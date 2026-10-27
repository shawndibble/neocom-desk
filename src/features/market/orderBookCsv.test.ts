import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { RegionOrder } from '@/esi/endpoints';
import { orderBookCsvColumns, rangeLabel } from './orderBookCsv';
import type { NpcStationLookup, SolarSystemLookup } from '@/engine/market/orderBook';

const t = (k: string, opts?: Record<string, unknown>) =>
  opts ? `${k}:${JSON.stringify(opts)}` : k;

const npcStations = new Map<number, NpcStationLookup>([
  [60003760, { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 }],
]);
const solarSystems = new Map<number, SolarSystemLookup>([
  [30000142, { name: 'Jita', security: 0.9459 }],
]);

function order(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 90,
    is_buy_order: false,
    issued: '2026-08-20T12:00:00.000Z',
    location_id: 60003760,
    min_volume: 1,
    order_id: 1,
    price: 500,
    range: 'station',
    system_id: 30000142,
    type_id: 34,
    volume_remain: 100,
    volume_total: 200,
    ...overrides,
  };
}

describe('rangeLabel', () => {
  it('maps the known enum values to translated labels', () => {
    expect(rangeLabel('station', t)).toBe('market.rangeStation');
    expect(rangeLabel('region', t)).toBe('market.rangeRegion');
    expect(rangeLabel('solarsystem', t)).toBe('market.rangeSystem');
  });

  it('maps a numeric string to a jump-count label', () => {
    expect(rangeLabel('5', t)).toBe('market.rangeJumps:{"count":5}');
  });

  it('passes through an unrecognized value unchanged', () => {
    expect(rangeLabel('weird', t)).toBe('weird');
  });
});

describe('orderBookCsvColumns (sell)', () => {
  it('orders columns price, quantity, location, expiry — no range/min volume', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: false });
    expect(columns.map((c) => c.header)).toEqual([
      'market.price',
      'market.quantity',
      'market.location',
      'market.expiry',
    ]);
  });

  it('emits raw numbers for price and quantity', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: false });
    const row = order({ price: 12345.5, volume_remain: 42 });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[0]).toBe('12345.5');
    expect(fields[1]).toBe('42');
  });

  it('resolves location to the same station · system (security) text the location cell shows', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: false });
    const locationColumn = columns.find((c) => c.header === 'market.location')!;
    expect(locationColumn.value(order())).toBe(
      'Jita IV - Moon 4 - Caldari Navy Assembly Plant · Jita (0.9)'
    );
  });

  it('emits the computed expiry as a raw ISO string', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: false });
    const expiryColumn = columns.find((c) => c.header === 'market.expiry')!;
    const row = order({ issued: '2026-08-20T12:00:00.000Z', duration: 1 });
    expect(expiryColumn.value(row)).toBe('2026-08-21T12:00:00.000Z');
  });
});

describe('orderBookCsvColumns (buy)', () => {
  it('appends range and min volume columns', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: true });
    expect(columns.map((c) => c.header)).toEqual([
      'market.price',
      'market.quantity',
      'market.location',
      'market.expiry',
      'market.range',
      'market.minVolume',
    ]);
  });

  it('emits a raw number for min volume', () => {
    const columns = orderBookCsvColumns(t, { npcStations, solarSystems, isBuy: true });
    const minVolumeColumn = columns.find((c) => c.header === 'market.minVolume')!;
    expect(minVolumeColumn.value(order({ min_volume: 250 }))).toBe(250);
  });
});
