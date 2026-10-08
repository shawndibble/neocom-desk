import { describe, expect, it } from 'vitest';
import type { NetWorthSnapshotRow } from './snapshot';
import {
  LAYER_IDS,
  buildCharacterSeries,
  dailyWalletFromJournal,
  layerValues,
  netWorthOf,
  partitionByCoverage,
  toggleHidden,
  totalsFor,
} from './series';

const row = (
  day: string,
  o: Partial<NetWorthSnapshotRow> = {},
  characterId = 1
): NetWorthSnapshotRow => ({
  id: `${characterId}:${day}`,
  characterId,
  day,
  wallet: 100,
  assetValue: 50,
  escrow: 10,
  sellStock: 5,
  hubId: 'jita',
  updatedAt: 1,
  ...o,
});

describe('layerValues / netWorthOf', () => {
  it('splits a row into the four layers, reading a missing sell stock as 0', () => {
    expect(layerValues(row('2026-10-01'))).toEqual({
      isk: 100,
      assets: 50,
      escrow: 10,
      sellOrders: 5,
    });
    expect(layerValues(row('2026-10-01', { sellStock: undefined })).sellOrders).toBe(0);
  });

  it('sums only the shown layers', () => {
    const v = layerValues(row('2026-10-01'));
    expect(netWorthOf(v, LAYER_IDS)).toBe(165);
    expect(netWorthOf(v, ['isk', 'escrow'])).toBe(110);
  });
});

describe('toggleHidden', () => {
  it('hides and re-shows an id', () => {
    expect(toggleHidden([], 'escrow', LAYER_IDS)).toEqual(['escrow']);
    expect(toggleHidden(['escrow'], 'escrow', LAYER_IDS)).toEqual([]);
  });

  it('refuses to hide the last visible one', () => {
    const hidden = ['assets', 'escrow', 'escrow', 'sellOrders'] as const;
    expect(toggleHidden(hidden, 'isk', LAYER_IDS)).toEqual(hidden);
  });

  it('ignores hidden ids that no longer exist when counting what is visible', () => {
    expect(toggleHidden([99], 1, [1])).toEqual([99]);
  });
});

describe('buildCharacterSeries', () => {
  it('backfills wallet-only days from the journal and joins layers at the first snapshot', () => {
    const s = buildCharacterSeries({
      walletByDay: new Map([
        ['2026-10-01', 80],
        ['2026-10-02', 90],
      ]),
      snapshots: [row('2026-10-03')],
    });
    expect(s.firstSnapshotDay).toBe('2026-10-03');
    expect(s.points.map((p) => [p.day, p.kind, p.isk])).toEqual([
      ['2026-10-01', 'wallet-only', 80],
      ['2026-10-02', 'wallet-only', 90],
      ['2026-10-03', 'snapshot', 100],
    ]);
    expect(s.points[0]!.layers).toBeNull();
    expect(s.points[2]!.layers?.assets).toBe(50);
  });

  it('keeps the wallet going through a gap and leaves the other layers null, never interpolated', () => {
    const s = buildCharacterSeries({
      walletByDay: new Map([['2026-10-02', 120]]),
      snapshots: [row('2026-10-01'), row('2026-10-03', { wallet: 130 })],
    });
    expect(s.points.map((p) => [p.day, p.kind, p.isk])).toEqual([
      ['2026-10-01', 'snapshot', 100],
      ['2026-10-02', 'gap', 120],
      ['2026-10-03', 'snapshot', 130],
    ]);
    expect(s.points[1]!.layers).toBeNull();
    expect(s.gapDays).toEqual(['2026-10-02']);
  });

  it('carries the last known wallet over a day with neither journal nor snapshot', () => {
    const s = buildCharacterSeries({
      walletByDay: new Map(),
      snapshots: [row('2026-10-01'), row('2026-10-03')],
    });
    expect(s.points[1]).toMatchObject({ day: '2026-10-02', kind: 'gap', isk: 100 });
  });

  it('handles one snapshot, and no data at all', () => {
    const one = buildCharacterSeries({ walletByDay: new Map(), snapshots: [row('2026-10-01')] });
    expect(one.points).toHaveLength(1);
    expect(one.firstSnapshotDay).toBe('2026-10-01');
    const none = buildCharacterSeries({ walletByDay: new Map(), snapshots: [] });
    expect(none).toEqual({ points: [], firstSnapshotDay: null, gapDays: [] });
  });

  it('with no snapshots, is wallet-only throughout', () => {
    const s = buildCharacterSeries({
      walletByDay: new Map([['2026-10-01', 5]]),
      snapshots: [],
    });
    expect(s.firstSnapshotDay).toBeNull();
    expect(s.points[0]!.kind).toBe('wallet-only');
  });
});

describe('partitionByCoverage', () => {
  it('leaves Characters missing a permission out', () => {
    expect(partitionByCoverage([1, 2, 3], new Set([1, 3]))).toEqual({
      included: [1, 3],
      missing: [2],
    });
  });
});

describe('totalsFor', () => {
  const latest = new Map([
    [1, layerValues(row('2026-10-01'))],
    [2, layerValues(row('2026-10-01', { wallet: 1000 }, 2))],
    [3, layerValues(row('2026-10-01', { wallet: 1 }, 3))],
  ]);

  it('sums shown layers over included, un-hidden Characters only', () => {
    const t = totalsFor(latest, { included: [1, 2], hidden: [2], shown: LAYER_IDS });
    expect(t.total).toBe(165);
    expect(t.perLayer.isk).toBe(100);
  });

  it('excludes a Character that lacks a permission from the totals', () => {
    const t = totalsFor(latest, { included: [1, 2], hidden: [], shown: ['isk'] });
    expect(t.total).toBe(1100);
  });
});

describe('dailyWalletFromJournal', () => {
  it('takes the last balance of each UTC day and skips entries without one', () => {
    const m = dailyWalletFromJournal([
      { date: '2026-10-01T10:00:00Z', balance: 5 },
      { date: '2026-10-01T20:00:00Z', balance: 7 },
      { date: '2026-10-01T22:00:00Z' },
      { date: '2026-10-02T01:00:00Z', balance: 9 },
    ]);
    expect([...m]).toEqual([
      ['2026-10-01', 7],
      ['2026-10-02', 9],
    ]);
  });
});
