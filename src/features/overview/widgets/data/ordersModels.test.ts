import { describe, expect, it } from 'vitest';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { ordersListed, ordersStateChart, ordersTable } from './ordersModels';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function order(over: Partial<OpenOrderRow> & { orderId: number }): OpenOrderRow {
  return {
    characterId: 1,
    characterName: 'A',
    typeId: 34,
    typeName: 'Tritanium',
    isBuyOrder: false,
    price: 100,
    volumeRemain: 1_200,
    volumeTotal: 2_000,
    locationId: 60003760,
    regionId: 10000002,
    stationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    issued: '2026-10-01T00:00:00Z',
    durationDays: 90,
    expiry: { expiresAt: NOW + 3 * DAY, daysLeft: 3, expired: false },
    floor: null,
    costBasis: null,
    station: { bestPrice: 100, beatsMe: false, gapIsk: 0, gapPct: 0 },
    deepUndercut: null,
    worstScope: null,
    problem: 'healthy',
    problems: ['healthy'],
    iskTiedUp: 120_000,
    belowFloor: false,
    frequentlyUndercut: false,
    ...over,
  } as OpenOrderRow;
}

const healthy = order({ orderId: 1 });
const undercut = order({
  orderId: 2,
  typeName: 'Nocxium',
  price: 1_000,
  problem: 'undercutStation',
  problems: ['undercutStation'],
  station: { bestPrice: 950, beatsMe: true, gapIsk: 50, gapPct: 5 },
  iskTiedUp: 1_200_000,
});
const outbid = order({
  orderId: 3,
  typeName: 'Pyerite',
  isBuyOrder: true,
  price: 10,
  problem: 'outbid',
  problems: ['outbid'],
  station: { bestPrice: 11, beatsMe: true, gapIsk: 1, gapPct: 10 },
  iskTiedUp: 12_000,
});
const floor = order({ orderId: 4, typeName: 'Mexallon', problem: 'belowFloor', belowFloor: true });
const expiring = order({
  orderId: 5,
  typeName: 'Isogen',
  problem: 'expiringOrStale',
  expiry: { expiresAt: NOW + 5 * HOUR, daysLeft: 0, expired: false },
  station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
});

describe('ordersListed', () => {
  it('sums only the sell side: a buy order is ISK in escrow, not listed', () => {
    expect(ordersListed([healthy, undercut, outbid])).toBe(120_000 + 1_200_000);
  });
});

describe('ordersTable', () => {
  const table = ordersTable(t, [healthy, expiring, outbid, undercut, floor], NOW, null);

  it('is real columns, with the item first and the key figure kept longest', () => {
    expect(table.columns.map((c) => c.key)).toEqual([
      'item',
      'side',
      'price',
      'vsBest',
      'expires',
      'station',
    ]);
    const byPriority = [...table.columns].sort((a, b) => a.priority! - b.priority!);
    expect(byPriority[0]!.key).toBe('item');
    expect(byPriority[1]!.key).toBe('vsBest');
  });

  it('drops the side and station on a narrow widget so the item name keeps its width', () => {
    expect(table.columns.filter((c) => c.hideNarrow).map((c) => c.key)).toEqual([
      'side',
      'station',
    ]);
    expect(table.columns.filter((c) => c.nameFloor).map((c) => c.key)).toEqual(['item']);
  });

  it('sorts the worst problem first, then by ISK tied up', () => {
    expect(table.rows.map((r) => r.key)).toEqual(['4', '2', '5', '3', '1']);
  });

  it('puts the quantity after the item and tones each row by its problem', () => {
    const row = table.rows.find((r) => r.key === '2')!;
    expect(row.cells[0]).toBe('Nocxium ×1.2K');
    expect(row.tone).toBe('warning');
    expect(table.rows.find((r) => r.key === '4')!.tone).toBe('critical');
    expect(table.rows.find((r) => r.key === '5')!.tone).toBe('watch');
    expect(table.rows.find((r) => r.key === '1')!.tone).toBe('clear');
  });

  it('writes vs best from the row gap, signed by which side of the best price it sits, and a dash with no rival price', () => {
    const cell = (key: string) => table.rows.find((r) => r.key === key)!.cells[3];
    expect(cell('2')).toEqual({ text: '+5%', tone: 'bad' });
    expect(cell('3')).toEqual({ text: '-10%', tone: 'bad' });
    expect(cell('1')).toBe('0%');
    expect(cell('5')).toBe('—');
  });

  it('reddens vs best only when a rival beats the order, whichever way the sign points', () => {
    const ahead = order({
      orderId: 8,
      price: 100,
      station: { bestPrice: 95, beatsMe: false, gapIsk: 5, gapPct: 5 },
    });
    const cell = ordersTable(t, [ahead], NOW, null).rows[0]!.cells[3];
    expect(cell).toBe('+5%');
  });

  it('counts down to expiry and calls a lapsed order expired', () => {
    const lapsed = order({
      orderId: 6,
      expiry: { expiresAt: NOW - HOUR, daysLeft: 0, expired: true },
    });
    const withLapsed = ordersTable(t, [expiring, healthy, lapsed], NOW, null);
    const expires = (key: string) => withLapsed.rows.find((r) => r.key === key)!.cells[4];
    expect(expires('5')).toBe('5h 0m');
    expect(expires('1')).toBe('3d 0h');
    expect(expires('6')).toBe('overview.widgets.orders.expired');
  });

  it('shows the station by its short name, the side as a word, and the price as an ISK cell', () => {
    const row = table.rows.find((r) => r.key === '3')!;
    expect(row.cells[1]).toBe('overview.widgets.orders.sideBuy');
    expect(row.cells[2]).toEqual({ text: '10', iskAmount: 10 });
    expect(row.cells[5]).toBe('Jita IV');
    const unnamed = ordersTable(t, [order({ orderId: 9, stationName: null })], NOW, null);
    expect(unnamed.rows[0]!.cells[5]).toBe('overview.widgets.orders.stationUnknown');
  });

  it('opts every column into sorting and sorts on the real value, not the compact text', () => {
    expect(table.columns.every((c) => c.sortable)).toBe(true);
    const sortOf = (key: string) => table.rows.find((r) => r.key === key)!.sort!;
    // item, side, price, vs best (signed gap), expires (the instant), station
    const [item, side, price, vsBest, expires, station] = sortOf('2');
    expect(item).toBe('Nocxium');
    expect(side).toBe('overview.widgets.orders.sideSell');
    expect(price).toBe(1_000);
    expect(vsBest).toBe(5);
    expect(expires).toBe(NOW + 3 * DAY);
    expect(station).toBe('Jita IV');
    expect(sortOf('3')[3]).toBe(-10);
  });

  it('leaves a sort key undefined where the cell has nothing to order by', () => {
    const noRival = order({
      orderId: 9,
      stationName: null,
      expiry: null,
      station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
    });
    const sort = ordersTable(t, [noRival], NOW, null).rows[0]!.sort!;
    expect(sort[3]).toBeUndefined();
    expect(sort[4]).toBeUndefined();
    expect(sort[5]).toBeUndefined();
  });

  it('carries the slots used as the footer only when the cap is known', () => {
    expect(table.footer).toBeUndefined();
    const withSlots = ordersTable(t, [healthy], NOW, { used: 38, total: 49 });
    expect(withSlots.footer).toBe('overview.widgets.orders.slots{"used":38,"total":49}');
  });
});

describe('ordersStateChart', () => {
  it('is null with no orders', () => {
    expect(ordersStateChart(t, [])).toBeNull();
  });

  it('is one stack of the states that have orders, the counts in the legend', () => {
    const model = ordersStateChart(t, [healthy, healthy, undercut, outbid, floor, expiring])!;
    expect(model.kind).toBe('stack');
    expect(model.parts.map((p) => [p.key, p.value, p.text])).toEqual([
      ['healthy', 2, '2'],
      ['undercut', 1, '1'],
      ['outbid', 1, '1'],
      ['expiring', 1, '1'],
      ['belowFloor', 1, '1'],
    ]);
  });

  it('counts an unchecked healthy order as Not checked, never in the Healthy part', () => {
    const unchecked = order({ orderId: 8, problem: 'healthy', competitionUnchecked: true });
    const model = ordersStateChart(t, [healthy, unchecked, unchecked])!;
    expect(model.parts.map((p) => [p.key, p.value])).toEqual([
      ['healthy', 1],
      ['notChecked', 2],
    ]);
  });

  it('folds the three undercut scopes into one Undercut part and skips empty states', () => {
    const region = order({ orderId: 7, problem: 'undercutRegion' });
    const model = ordersStateChart(t, [undercut, region])!;
    expect(model.parts.map((p) => [p.key, p.value])).toEqual([['undercut', 2]]);
  });

  it('says every count in the hidden summary and never colours a part red', () => {
    const model = ordersStateChart(t, [healthy, undercut])!;
    expect(model.summary).toContain('"open":2');
    expect(model.parts.map((p) => p.color)).not.toContain('iskNeg');
  });
});
