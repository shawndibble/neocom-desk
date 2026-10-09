import { describe, expect, it } from 'vitest';
import { lineRows, stackRows } from './chartRows';
import { buildCharacterSeries } from './series';
import type { NetWorthSnapshotRow } from './snapshot';

const row = (day: string, characterId = 1, wallet = 100): NetWorthSnapshotRow => ({
  id: `${characterId}:${day}`,
  characterId,
  day,
  wallet,
  assetValue: 50,
  escrow: 10,
  sellStock: 5,
  hubId: 'jita',
  updatedAt: 1,
});

describe('stackRows', () => {
  const series = buildCharacterSeries({
    walletByDay: new Map([['2026-10-01', 90]]),
    snapshots: [row('2026-10-02'), row('2026-10-04', 1, 140)],
  });

  it('stacks only the shown layers on snapshot days', () => {
    const rows = stackRows(series, ['isk', 'escrow']);
    expect(rows[1]).toMatchObject({ day: '2026-10-02', total: 110 });
    expect(rows[1]!.values).toEqual({ isk: 100, assets: 0, escrow: 10, sellOrders: 0 });
  });

  it('keeps only the wallet on wallet-only and gap days', () => {
    const rows = stackRows(series, ['isk', 'assets']);
    expect(rows[0]).toMatchObject({ day: '2026-10-01', kind: 'wallet-only', total: 90 });
    expect(rows[2]).toMatchObject({ day: '2026-10-03', kind: 'gap', total: 100 });
    expect(rows[2]!.values.assets).toBe(0);
  });

  it('contributes nothing from the wallet when the ISK layer is off', () => {
    const rows = stackRows(series, ['assets']);
    expect(rows[0]!.total).toBe(0);
  });
});

describe('lineRows', () => {
  const a = buildCharacterSeries({
    walletByDay: new Map(),
    snapshots: [row('2026-10-01', 1), row('2026-10-02', 1)],
  });
  const b = buildCharacterSeries({
    walletByDay: new Map(),
    snapshots: [row('2026-10-02', 2, 500)],
  });

  it('has one value per Character per day, null where that Character has no point', () => {
    const rows = lineRows(
      new Map([
        [1, a],
        [2, b],
      ]),
      ['isk', 'assets']
    );
    expect(rows.map((r) => r.day)).toEqual(['2026-10-01', '2026-10-02']);
    expect(rows[0]).toMatchObject({ c1: 150, c2: null });
    expect(rows[1]).toMatchObject({ c1: 150, c2: 550 });
  });

  it('plots the wallet through non-snapshot days only when ISK alone is shown', () => {
    const g = buildCharacterSeries({
      walletByDay: new Map([['2026-10-01', 70]]),
      snapshots: [row('2026-10-02')],
    });
    expect(lineRows(new Map([[1, g]]), ['isk'])[0]).toMatchObject({ c1: 70 });
    expect(lineRows(new Map([[1, g]]), ['isk', 'assets'])[0]).toMatchObject({ c1: null });
  });
});
