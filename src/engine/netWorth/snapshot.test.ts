import { describe, expect, it } from 'vitest';
import {
  buildSnapshotRow,
  findMissingDays,
  mergeSnapshotRows,
  snapshotId,
  utcDay,
  type NetWorthSnapshotRow,
} from './snapshot';

const PLEX = 44992;
const NOW = Date.UTC(2026, 9, 7, 13, 0, 0);

const base = {
  characterId: 1,
  now: NOW,
  hubId: 'jita',
  wallet: 1_000,
  assets: [
    { type_id: 34, quantity: 10, item_id: 1 },
    { type_id: PLEX, quantity: 5, item_id: 2, location_flag: 'Hangar' },
  ],
  orders: [
    { is_buy_order: true, escrow: 300 },
    { is_buy_order: false, escrow: 999, price: 10, volume_remain: 3 },
    { is_buy_order: true },
    { is_buy_order: false, is_corporation: true, price: 100, volume_remain: 100 },
  ],
  priceByTypeId: new Map([
    [34, 6],
    [PLEX, 4_000_000],
  ]),
  plexPrice: 5_000_000,
};

describe('utcDay', () => {
  it('formats the UTC calendar day', () => {
    expect(utcDay(Date.UTC(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});

describe('buildSnapshotRow', () => {
  it('splits PLEX out of the asset value and prices it at the PLEX price', () => {
    const row = buildSnapshotRow(base);
    expect(row).toEqual({
      id: '1:2026-10-07',
      characterId: 1,
      day: '2026-10-07',
      wallet: 1_000,
      assetValue: 60,
      plexValue: 25_000_000,
      escrow: 300,
      sellStock: 30,
      hubId: 'jita',
      updatedAt: NOW,
    });
  });

  it('counts only buy-order escrow', () => {
    expect(
      buildSnapshotRow({ ...base, orders: [{ is_buy_order: false, escrow: 5 }] })?.escrow
    ).toBe(0);
  });

  it('values remaining sell-order stock as volume_remain x price, skipping corp orders', () => {
    expect(buildSnapshotRow(base)?.sellStock).toBe(30);
    expect(
      buildSnapshotRow({ ...base, orders: [{ is_buy_order: true, escrow: 5, price: 9 }] })
        ?.sellStock
    ).toBe(0);
  });

  it('counts only hangar PLEX, and never as asset value', () => {
    const row = buildSnapshotRow({
      ...base,
      assets: [{ type_id: PLEX, quantity: 5, item_id: 2, location_flag: 'CorpDeliveries' }],
    });
    expect(row?.plexValue).toBe(0);
    expect(row?.assetValue).toBe(0);
  });

  it('writes no row when a source is missing a permission', () => {
    expect(buildSnapshotRow({ ...base, wallet: null })).toBeNull();
    expect(buildSnapshotRow({ ...base, assets: null })).toBeNull();
    expect(buildSnapshotRow({ ...base, orders: null })).toBeNull();
  });

  it('records PLEX as 0 rather than guessing when the PLEX price is unavailable', () => {
    expect(buildSnapshotRow({ ...base, plexPrice: null })?.plexValue).toBe(0);
  });
});

describe('mergeSnapshotRows', () => {
  const row = (day: string, updatedAt: number, wallet: number): NetWorthSnapshotRow => ({
    id: snapshotId(1, day),
    characterId: 1,
    day,
    wallet,
    assetValue: 0,
    plexValue: 0,
    escrow: 0,
    hubId: 'jita',
    updatedAt,
  });

  it('keeps the last write for the same character and day, and the union of days', () => {
    const merged = mergeSnapshotRows(
      [row('2026-10-01', 1, 10), row('2026-10-02', 5, 20)],
      [row('2026-10-02', 9, 99), row('2026-10-03', 1, 30)]
    );
    expect(merged.map((r) => [r.day, r.wallet])).toEqual([
      ['2026-10-01', 10],
      ['2026-10-02', 99],
      ['2026-10-03', 30],
    ]);
  });
});

describe('findMissingDays', () => {
  it('lists days with no row between the first and last, never interpolating', () => {
    expect(findMissingDays(['2026-10-01', '2026-10-04', '2026-10-02'])).toEqual(['2026-10-03']);
    expect(findMissingDays([])).toEqual([]);
  });
});
