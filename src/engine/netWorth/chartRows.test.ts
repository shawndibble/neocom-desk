import { describe, expect, it } from 'vitest';
import { lastDays, lineKey, lineRows, stackRows, tooltipLines, type LineRow } from './chartRows';
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
    expect(rows[1]!.values).toEqual({
      isk: 100,
      assets: 0,
      escrow: 10,
      sellOrders: 0,
      contracts: 0,
    });
  });

  it('backfills the layers before the first snapshot from it, keeping the real wallet', () => {
    const rows = stackRows(series, ['isk', 'assets']);
    expect(rows[0]).toMatchObject({ day: '2026-10-01', kind: 'wallet-only', estimated: true });
    expect(rows[0]).toMatchObject({ total: 140 });
    expect(rows[1]!.estimated).toBe(false);
  });

  it('joins a missed day to its neighbours instead of dropping to the wallet', () => {
    const gapped = buildCharacterSeries({
      walletByDay: new Map(),
      snapshots: [row('2026-10-01', 1, 100), { ...row('2026-10-03', 1, 100), assetValue: 150 }],
    });
    const rows = stackRows(gapped, ['isk', 'assets']);
    expect(rows[1]).toMatchObject({ kind: 'gap', estimated: true, total: 200 });
    expect(rows[1]!.values.assets).toBe(100);
  });

  it('repeats the last snapshot after it', () => {
    const trailing = buildCharacterSeries({
      walletByDay: new Map([['2026-10-02', 120]]),
      snapshots: [row('2026-10-01', 1, 100)],
    });
    expect(stackRows(trailing, ['isk', 'assets'])[1]).toMatchObject({
      estimated: true,
      total: 170,
    });
  });

  it('draws the estimate for the layers shown even when the ISK layer is off', () => {
    const rows = stackRows(series, ['assets']);
    expect(rows[0]!.total).toBe(50);
  });
});

describe('lastDays', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((day) => ({
    x: Date.parse(day),
  }));
  it('keeps the newest N daily rows', () => {
    expect(lastDays(days, 2)).toEqual(days.slice(2));
  });
  it('keeps everything when the series is shorter than the range', () => {
    expect(lastDays(days, 90)).toEqual(days);
    expect(lastDays([], 7)).toEqual([]);
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

  it('plots an estimate through non-snapshot days', () => {
    const g = buildCharacterSeries({
      walletByDay: new Map([['2026-10-01', 70]]),
      snapshots: [row('2026-10-02')],
    });
    expect(lineRows(new Map([[1, g]]), ['isk'])[0]).toMatchObject({ c1: 70 });
    expect(lineRows(new Map([[1, g]]), ['isk', 'assets'])[0]).toMatchObject({ c1: 120 });
  });
});

describe('tooltipLines', () => {
  const lines = [
    { characterId: 1, name: 'Ann' },
    { characterId: 2, name: 'Bo' },
    { characterId: 3, name: 'Cy' },
    { characterId: 4, name: 'Di' },
  ];
  const day = (values: Record<number, number | null>): LineRow => {
    const row: LineRow = { day: '2026-10-01', x: Date.parse('2026-10-01') };
    for (const [id, value] of Object.entries(values)) row[lineKey(Number(id))] = value;
    return row;
  };

  it("orders by that day's value, highest first", () => {
    const entries = tooltipLines(day({ 1: 10, 2: 30, 3: 20, 4: 5 }), lines);
    expect(entries.map((e) => e.line.name)).toEqual(['Bo', 'Cy', 'Ann', 'Di']);
  });

  it('keeps each colour tied to the character, not its sorted position', () => {
    const entries = tooltipLines(day({ 1: 10, 2: 30, 3: 20, 4: 5 }), lines);
    expect(entries.map((e) => [e.line.characterId, e.colorIndex])).toEqual([
      [2, 1],
      [3, 2],
      [1, 0],
      [4, 3],
    ]);
  });

  it('breaks ties by chart line order', () => {
    const entries = tooltipLines(day({ 1: 10, 2: 10, 3: 20, 4: 10 }), lines);
    expect(entries.map((e) => e.line.name)).toEqual(['Cy', 'Ann', 'Bo', 'Di']);
  });

  it('lists characters with no point that day last, in line order', () => {
    const entries = tooltipLines(day({ 1: null, 2: 5, 4: -3 }), lines);
    expect(entries.map((e) => [e.line.name, e.value])).toEqual([
      ['Bo', 5],
      ['Di', -3],
      ['Ann', null],
      ['Cy', null],
    ]);
  });
});
