import { describe, expect, it } from 'vitest';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import type { WalletJournalEntry } from '@/esi/endpoints';
import type { StockBoardMarket } from '@/features/stockTargets/stockBoard';
import type { NetWorthCharacter } from './kindLoaders';
import {
  balanceChange,
  flowBuckets,
  flowBars,
  flowSecondary,
  flowTable,
  lpTable,
  miningTaxTable,
  netWorthSeries,
  netWorthTable,
  priceWatchTable,
  stockChart,
  stockTable,
  journalTable,
  ordersListed,
  ordersStateChart,
  ordersTable,
} from './moneyModels';

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

describe('balanceChange', () => {
  it('is the rise or fall over the days the series covers, with the direction and whether it is good', () => {
    expect(balanceChange(t, [100, 130, 150])).toEqual({
      text: 'overview.widgets.wallet.change{"isk":"+50","count":3}',
      direction: 'up',
      tone: 'good',
    });
    expect(balanceChange(t, [150, 100])).toMatchObject({ direction: 'down', tone: 'bad' });
  });

  it('is flat, not signed, when the balance did not move, and absent under two days', () => {
    expect(balanceChange(t, [100, 90, 100])).toMatchObject({ direction: 'flat' });
    expect(balanceChange(t, [100])).toBeUndefined();
    expect(balanceChange(t, [])).toBeUndefined();
  });
});

describe('journalTable', () => {
  const entry = (id: number, hoursAgo: number, amount: number | undefined, balance?: number) =>
    ({
      id,
      date: new Date(NOW - hoursAgo * HOUR).toISOString(),
      ref_type: 'bounty_prizes',
      description: '',
      amount,
      balance,
    }) as WalletJournalEntry;

  it('is the newest entries first, at most six, skipping any with no amount', () => {
    const entries = [
      entry(1, 9, 5),
      entry(2, 1, 10, 1000),
      entry(3, 2, undefined),
      entry(4, 3, -20),
      entry(5, 4, 1),
      entry(6, 5, 1),
      entry(7, 6, 1),
      entry(8, 7, 1),
    ];
    const table = journalTable(t, entries, NOW);
    expect(table.rows.map((r) => r.key)).toEqual(['2', '4', '5', '6', '7', '8']);
  });

  it('reads type, signed amount, age and the balance after it', () => {
    const table = journalTable(t, [entry(2, 1, 1_500_000, 4_800_000_000)], NOW);
    expect(table.columns.map((c) => c.key)).toEqual(['type', 'amount', 'when', 'balance']);
    expect(table.rows[0]!.cells).toEqual([
      'Bounty prizes',
      { text: '+1.5M', tone: 'good' },
      'common.age.hours{"count":1}',
      { text: '4.8B', iskAmount: 4_800_000_000 },
    ]);
  });

  it('writes a missing balance as a dash and an outflow with its own sign', () => {
    const table = journalTable(t, [entry(4, 3, -2_000_000)], NOW);
    expect(table.rows[0]!.cells[1]).toEqual({ text: '-2M', tone: 'bad' });
    expect(table.rows[0]!.cells[3]).toBe('—');
  });
});

describe('wallet flow', () => {
  const e = (daysAgo: number, amount: number, ref = 'bounty_prizes') =>
    ({
      id: Math.round(daysAgo * 1000 + Math.abs(amount)),
      date: new Date(NOW - daysAgo * DAY).toISOString(),
      ref_type: ref,
      description: '',
      amount,
    }) as WalletJournalEntry;

  describe('flowBuckets', () => {
    it('is a bar per day at a 7-day range, income and spending apart, newest last', () => {
      const b = flowBuckets([e(0.5, 100), e(0.6, -30), e(1.5, 50), e(6.5, -10)], NOW, 7);
      expect(b.daily).toBe(true);
      expect(b.income).toEqual([0, 0, 0, 0, 0, 50, 100]);
      expect(b.spending).toEqual([10, 0, 0, 0, 0, 0, 30]);
    });

    it('is a bar per week at a longer range, spending as a positive magnitude', () => {
      const b = flowBuckets([e(1, 100), e(8, -40), e(20, 7)], NOW, 30);
      expect(b.daily).toBe(false);
      expect(b.income).toHaveLength(5);
      expect(b.income[4]).toBe(100);
      expect(b.spending[3]).toBe(40);
      expect(b.income[2]).toBe(7);
    });
  });

  describe('flowBars', () => {
    it('is null with nothing moved', () => {
      expect(flowBars(t, [], NOW, 30, 'note', 'summary')).toBeNull();
    });

    it('draws one net bar per week, labels each, and keeps the summary it was given', () => {
      const m = flowBars(t, [e(1, 100), e(8, -250)], NOW, 30, 'a note', 'the summary')!;
      expect(m.kind).toBe('bars');
      expect(m.gains).toBe(true);
      expect(m.values.slice(-2)).toEqual([-250, 100]);
      expect(m.barLabels).toHaveLength(m.values.length);
      expect(m.max).toBe('overview.widgets.chart.max{"value":"100"}');
      expect(m.xStart).toBe('overview.widgets.chart.weeksAgo{"count":5}');
      expect(m.xEnd).toBe('overview.widgets.chart.thisWeek');
      expect(m.note).toBe('a note');
      expect(m.summary).toBe('the summary');
    });

    it('reads income, spending and net apart on hover', () => {
      const m = flowBars(t, [e(1, 100), e(1, -30)], NOW, 7, 'n', 's')!;
      const last = m.tips!.at(-2)!;
      expect(last.rows.map((r) => r.label)).toEqual([
        'overview.widgets.chart.tip.income',
        'overview.widgets.chart.tip.spending',
        'overview.widgets.chart.tip.net',
      ]);
      expect(last.rows.map((r) => r.value)).toEqual(['100', '30', '+70']);
    });
  });

  describe('flowTable', () => {
    const rows = [
      { refType: 'bounty_prizes', income: 900, expense: 0, net: 900, count: 3 },
      { refType: 'market_transaction', income: 100, expense: 400, net: -300, count: 2 },
    ];
    const table = flowTable(t, rows);

    it('is Type, Net, Income, Spending, Share with the net kept longest', () => {
      expect(table.columns.map((c) => c.key)).toEqual([
        'type',
        'net',
        'income',
        'spending',
        'share',
      ]);
      expect(table.columns.find((c) => c.priority === 1)!.key).toBe('net');
    });

    it('splits each type into what came in and went out, and its share of the movement', () => {
      expect(table.rows[0]!.cells).toEqual([
        'Bounty prizes',
        { text: '+900', tone: 'good' },
        { text: '900', tone: 'good' },
        '0',
        { text: '64%', bar: 900 / 1400 },
      ]);
      expect(table.rows[1]!.cells).toEqual([
        'Market transaction',
        { text: '-300', tone: 'bad' },
        { text: '100', tone: 'good' },
        { text: '400', tone: 'bad' },
        { text: '36%', bar: 500 / 1400 },
      ]);
    });
  });

  describe('flowSecondary', () => {
    const rows = [
      { refType: 'bounty_prizes', income: 900, expense: 0, net: 900, count: 3 },
      { refType: 'market_transaction', income: 100, expense: 400, net: -300, count: 2 },
    ];

    it('compares with the previous window when the journal reaches back twice the range', () => {
      const entries = [e(1, 500), e(8, 200)];
      const s = flowSecondary(t, entries, NOW, 7, 14, rows)!;
      expect(s.direction).toBe('up');
      expect(s.tone).toBe('good');
      expect(s.text).toBe('overview.widgets.walletFlow.change{"isk":"+300","count":7}');
    });

    it('is a fall, and bad, when the window earned less than the one before', () => {
      const s = flowSecondary(t, [e(1, 100), e(8, 500)], NOW, 7, 14, rows)!;
      expect(s).toMatchObject({ direction: 'down', tone: 'bad' });
    });

    it('names the biggest source instead when the journal is too short to compare', () => {
      const s = flowSecondary(t, [e(1, 100)], NOW, 30, 30, rows)!;
      expect(s.direction).toBeUndefined();
      expect(s.text).toBe('overview.widgets.walletFlow.top{"name":"Bounty prizes","isk":"900"}');
    });

    it('has no line when nothing came in', () => {
      expect(flowSecondary(t, [], NOW, 30, 30, [])).toBeUndefined();
    });
  });
});

describe('net worth', () => {
  const layers = (isk: number, assets: number, escrow = 0, sellOrders = 0) => ({
    isk,
    assets,
    escrow,
    sellOrders,
  });
  const char = (
    id: number,
    history: { day: string; layers: ReturnType<typeof layers> }[]
  ): NetWorthCharacter => ({
    characterId: id,
    day: history[history.length - 1]?.day ?? '',
    covered: true,
    layers: history[history.length - 1]?.layers ?? layers(0, 0),
    history,
  });

  describe('netWorthSeries', () => {
    it('is each day one total per layer, oldest first', () => {
      const series = netWorthSeries([
        char(1, [
          { day: '2026-10-09', layers: layers(10, 100) },
          { day: '2026-10-10', layers: layers(20, 110) },
        ]),
      ]);
      expect(series.days).toEqual(['2026-10-09', '2026-10-10']);
      expect(series.layers.isk).toEqual([10, 20]);
      expect(series.layers.assets).toEqual([100, 110]);
      expect(series.totals).toEqual([110, 130]);
    });

    it('sums Characters, carrying a missing day forward from the last snapshot', () => {
      const series = netWorthSeries([
        char(1, [
          { day: '2026-10-09', layers: layers(10, 100) },
          { day: '2026-10-10', layers: layers(10, 100) },
        ]),
        char(2, [{ day: '2026-10-09', layers: layers(1, 1) }]),
      ]);
      expect(series.totals).toEqual([112, 112]);
    });

    it('starts only once every Character has a snapshot, so a late alt draws no fake jump', () => {
      const series = netWorthSeries([
        char(1, [
          { day: '2026-10-08', layers: layers(0, 100) },
          { day: '2026-10-09', layers: layers(0, 100) },
          { day: '2026-10-10', layers: layers(0, 100) },
        ]),
        char(2, [{ day: '2026-10-10', layers: layers(0, 50) }]),
      ]);
      expect(series.days).toEqual(['2026-10-10']);
      expect(series.totals).toEqual([150]);
    });

    it('is empty with no Characters', () => {
      expect(netWorthSeries([])).toEqual({
        days: [],
        layers: { isk: [], assets: [], escrow: [], sellOrders: [] },
        totals: [],
      });
    });
  });

  describe('netWorthTable', () => {
    const series = netWorthSeries([
      char(1, [
        { day: '2026-10-09', layers: layers(10, 100, 0, 40) },
        { day: '2026-10-10', layers: layers(30, 100, 0, 20) },
      ]),
    ]);
    const table = netWorthTable(t, layers(30, 100, 0, 20), series, ['assets', 'sellOrders', 'isk']);

    it('is Layer, Value, Share, Change with the value kept longest', () => {
      expect(table.columns.map((c) => c.key)).toEqual(['layer', 'value', 'share', 'change']);
      expect(table.columns.find((c) => c.priority === 1)!.key).toBe('value');
    });

    it('gives each layer its value, share of the total, and change over the series', () => {
      expect(table.rows.map((r) => r.key)).toEqual(['assets', 'sellOrders', 'isk']);
      expect(table.rows[0]!.cells).toEqual([
        'wallet.netWorth.layers.assets',
        { text: '100', iskAmount: 100 },
        { text: '67%', bar: 100 / 150 },
        '0',
      ]);
      expect(table.rows[1]!.cells[3]).toEqual({ text: '-20', tone: 'bad' });
      expect(table.rows[2]!.cells[3]).toEqual({ text: '+20', tone: 'good' });
    });

    it('has no change to give from a single day', () => {
      const one = netWorthSeries([char(1, [{ day: '2026-10-10', layers: layers(1, 1) }])]);
      expect(netWorthTable(t, layers(1, 1), one, ['isk']).rows[0]!.cells[3]).toBe('—');
    });
  });
});

describe('stock', () => {
  const market = (
    listId: string,
    name: string,
    s: Partial<StockBoardMarket['summary']> = {}
  ): StockBoardMarket => ({
    listId,
    name,
    summary: {
      out: 0,
      low: 0,
      ok: 0,
      over: 0,
      readyToList: 0,
      costToFill: 0,
      unpricedShort: 0,
      ...s,
    },
  });
  const markets = [
    market('a', 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', {
      out: 1,
      low: 2,
      ok: 7,
      readyToList: 2,
      costToFill: 35_000_000,
    }),
    market('b', 'Amarr VIII (Oris) - Emperor Family Academy', { ok: 5, over: 3 }),
    market('c', 'Dodixie IX - Moon 20', { low: 1, ok: 2 }),
  ];

  describe('stockTable', () => {
    const table = stockTable(t, markets);

    it('lists every market, the worst first, healthy ones included', () => {
      expect(table.rows.map((r) => r.key)).toEqual(['a', 'c', 'b']);
    });

    it('is Market, Out, Low, To restock, Ready with what restocking costs kept longest', () => {
      expect(table.columns.map((c) => c.key)).toEqual(['market', 'out', 'low', 'restock', 'ready']);
      const byPriority = [...table.columns].sort((a, b) => a.priority! - b.priority!);
      expect(byPriority.map((c) => c.key)).toEqual(['market', 'restock', 'out', 'low', 'ready']);
    });

    it('reads the short name, the counts, and the ISK to restock as an ISK cell or a dash', () => {
      expect(table.rows[0]!.cells).toEqual([
        'Jita IV',
        '1',
        '2',
        { text: '35M', iskAmount: 35_000_000 },
        '2',
      ]);
      expect(table.rows[2]!.cells).toEqual(['Amarr VIII (Oris)', '0', '0', '—', '0']);
    });

    it('tones a market by how short it is and links to its list', () => {
      expect(table.rows.map((r) => r.tone)).toEqual(['critical', 'warning', 'clear']);
      expect(table.rows[0]!.to).toBe('/market/stock/a');
    });
  });

  describe('stockChart', () => {
    it('is null with nothing stocked in any market', () => {
      expect(stockChart(t, [market('x', 'Empty')])).toBeNull();
    });

    it('is a stacked row per market in Out, Low, OK, Over order, skipping markets with no items', () => {
      const m = stockChart(t, [...markets, market('x', 'Empty')])!;
      expect(m.kind).toBe('stackRows');
      expect(m.rows.map((r) => r.key)).toEqual(['a', 'c', 'b']);
      expect(m.rows[0]!.parts.map((p) => [p.key, p.value])).toEqual([
        ['out', 1],
        ['low', 2],
        ['ok', 7],
        ['over', 0],
      ]);
      expect(m.rows[0]!.text).toBe('overview.widgets.stock.rowShort{"count":3}');
      expect(m.rows[2]!.text).toBe('overview.widgets.stock.rowOk');
    });

    it('totals each state across the markets for the legend, with counts in the text', () => {
      const m = stockChart(t, markets)!;
      expect(m.legend.map((l) => [l.key, l.text])).toEqual([
        ['out', '1'],
        ['low', '3'],
        ['ok', '14'],
        ['over', '3'],
      ]);
    });

    it('never draws a series in the loss red', () => {
      const m = stockChart(t, markets)!;
      expect(m.legend.map((l) => l.color)).not.toContain('iskNeg');
    });
  });
});

describe('price watch', () => {
  const alert = (
    name: string,
    direction: 'above' | 'below',
    targetPrice: number,
    price: number | null,
    crossed = false
  ) => ({ typeId: name.length, name, direction, targetPrice, price, crossed });

  it('is Item, Gap, Now, Target with the gap kept longest', () => {
    const table = priceWatchTable(t, []);
    expect(table.columns.map((c) => c.key)).toEqual(['item', 'gap', 'now', 'target']);
    expect(table.columns.find((c) => c.priority === 1)!.key).toBe('gap');
  });

  it('puts the hit targets first, then the nearest, the unpriced last', () => {
    const table = priceWatchTable(t, [
      alert('Far', 'above', 100, 50),
      alert('Hit', 'above', 100, 130, true),
      alert('Unpriced', 'below', 100, null),
      alert('Near', 'below', 100, 105),
    ]);
    expect(table.rows.map((r) => r.cells[0])).toEqual(['Hit', 'Near', 'Far', 'Unpriced']);
  });

  it('writes the price against its target as a signed percent, and the target by direction', () => {
    const [near] = priceWatchTable(t, [alert('Near', 'below', 100, 105)]).rows;
    expect(near!.cells).toEqual([
      'Near',
      { text: '+5%', tone: 'caution' },
      { text: '105', iskAmount: 105 },
      'overview.widgets.priceWatch.target.below{"isk":"100"}',
    ]);
    const [far] = priceWatchTable(t, [alert('Far', 'above', 100, 50)]).rows;
    expect(far!.cells[1]).toBe('-50%');
    const [hit] = priceWatchTable(t, [alert('Hit', 'above', 100, 130, true)]).rows;
    expect(hit!.cells[1]).toEqual({ text: '+30%', tone: 'good' });
    expect(far!.cells[3]).toBe('overview.widgets.priceWatch.target.above{"isk":"100"}');
  });

  it('shows a dash for a target the poller has not priced, and tones a hit target', () => {
    const rows = priceWatchTable(t, [
      alert('Hit', 'above', 100, 130, true),
      alert('Unpriced', 'below', 100, null),
    ]).rows;
    expect(rows[1]!.cells.slice(1, 3)).toEqual(['—', '—']);
    expect(rows.map((r) => r.tone)).toEqual(['warning', 'clear']);
  });
});

describe('loyalty points', () => {
  it('is Corporation, LP, Share with each corporation as a share of the total', () => {
    const table = lpTable(t, [
      { name: 'Caldari Navy', corporationId: 1, points: 750 },
      { name: null, corporationId: 2, points: 250 },
    ]);
    expect(table.columns.map((c) => c.key)).toEqual(['corporation', 'lp', 'share']);
    expect(table.rows.map((r) => r.cells)).toEqual([
      ['Caldari Navy', '750', { text: '75%', bar: 0.75 }],
      ['overview.widgets.data.lp.corporation{"id":2}', '250', { text: '25%', bar: 0.25 }],
    ]);
  });

  it('gives a sliver a share of at least 1% rather than a zero that says nothing', () => {
    const table = lpTable(t, [
      { name: 'Big', corporationId: 1, points: 100_000 },
      { name: 'Tiny', corporationId: 2, points: 1 },
    ]);
    expect(table.rows[1]!.cells[2]).toMatchObject({ text: '<1%' });
  });
});

describe('mining tax', () => {
  it('is Payee, Unpaid, Oldest, Entries with the ISK owed kept longest', () => {
    const table = miningTaxTable(t, [], 0);
    expect(table.columns.map((c) => c.key)).toEqual(['payee', 'unpaid', 'oldest', 'entries']);
    expect(table.columns.find((c) => c.priority === 1)!.key).toBe('unpaid');
  });

  it('lists each payee with what is owed, the age of the oldest entry and how many entries', () => {
    const table = miningTaxTable(
      t,
      [
        { payeeId: 'p1', name: 'Corp Tax', unpaidIsk: 10_900_000, oldestDays: 13, entries: 4 },
        { payeeId: '', name: '', unpaidIsk: 5, oldestDays: null, entries: 1 },
      ],
      0
    );
    expect(table.rows[0]!.cells).toEqual([
      'Corp Tax',
      { text: '10.9M', iskAmount: 10_900_000 },
      'overview.widgets.miningTax.days{"count":13}',
      '4',
    ]);
    expect(table.rows[1]!.cells[0]).toBe('overview.widgets.miningTax.noPayee');
    expect(table.rows[1]!.cells[2]).toBe('—');
  });

  it('notes the entries no assignment covers yet as the footer, only when there are some', () => {
    expect(miningTaxTable(t, [], 0).footer).toBeUndefined();
    expect(miningTaxTable(t, [], 3).footer).toBe(
      'overview.widgets.miningTax.unassigned{"count":3}'
    );
  });
});
