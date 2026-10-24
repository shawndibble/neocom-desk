import { describe, expect, it } from 'vitest';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { marketTrend, trendText } from './marketTrendModel';
import type { MarketTrendFeed, MarketTrendSeries } from './marketTrendLoader';
import type { BuildContext, FeedState } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (
  range: 7 | 30 | 90 | 365 = 30,
  picks: Pick<BuildContext, 'trendItems' | 'trendHubs'> = {}
): BuildContext => ({
  t,
  now: Date.parse('2026-10-24T12:00:00Z'),
  activeCharacterId: 91,
  scopeAll: false,
  notTrainingAlert: false,
  range,
  ...picks,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const day = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString().slice(0, 10);
const pt = (date: string, average: number): MarketHistoryPoint => ({
  date,
  average,
  highest: average,
  lowest: average,
  volume: 1,
  orderCount: 1,
});
const line = (
  typeId: number,
  name: string,
  averages: number[],
  hubId: string | null = 'jita'
): MarketTrendSeries => ({
  key: `${typeId}@${hubId ?? 'global'}`,
  typeId,
  hubId,
  name,
  points: averages.map((a, i) => pt(day(24 - averages.length + 1 + i), a)),
  to: `/market/browser?type=${typeId}&hub=${hubId}`,
  fromCache: false,
  failed: false,
});
const data = (
  lines: MarketTrendSeries[],
  patch: Partial<MarketTrendFeed> = {},
  quickbar = lines.map(({ typeId, name }) => ({ typeId, name }))
) => ({
  marketTrend: ok<MarketTrendFeed>({
    quickbar,
    defaultHubId: 'jita',
    globalTypeIds: [44992],
    series: Object.fromEntries(lines.map((l) => [l.key, l])),
    fetchedAt: new Date('2026-10-24T11:00:00Z'),
    ...patch,
  }),
});

describe('trendText', () => {
  it('signs a change and keeps unknown as a dash', () => {
    expect(trendText(0.1234)).toBe('+12.3%');
    expect(trendText(-0.03)).toBe('-3.0%');
    expect(trendText(0)).toBe('0.0%');
    expect(trendText(null)).toBe('—');
  });
});

describe('marketTrend builder', () => {
  const rising = line(
    34,
    'Tritanium',
    Array.from({ length: 31 }, (_, i) => 100 + i)
  );
  const short = line(44992, 'PLEX', [5_000_000, 5_100_000], null);

  it('is blank until the feed lands, and empty for an empty Quickbar', () => {
    expect(marketTrend({}, ctx()).status.hasData).toBe(false);
    const view = marketTrend(data([]), ctx());
    expect(view.status.isEmpty).toBe(true);
  });

  it('tabulates latest price with 7d and 30d change, unknown where history is short', () => {
    const view = marketTrend(data([rising, short]), ctx());
    const [tri, plex] = view.table!.rows;
    expect(tri!.to).toBe('/market/browser?type=34&hub=jita');
    expect(tri!.cells[2]).toEqual({ text: '+5.7%', tone: 'good' });
    expect(tri!.cells[3]).toEqual({ text: '+30.0%', tone: 'good' });
    expect(plex!.cells[2]).toBe('—');
    expect(plex!.cells[3]).toBe('—');
  });

  it('draws one line per item with history, indexed to zero at the range start', () => {
    const view = marketTrend(data([rising, short]), ctx(7));
    const chart = view.chart!;
    expect(chart.kind).toBe('lines');
    if (chart.kind !== 'lines') return;
    expect(chart.series.map((s) => s.label)).toEqual(['Tritanium', 'PLEX']);
    expect(chart.series[0]!.values[0]).toBe(0);
    expect(chart.series[0]!.end).toBe('+4.8%');
    expect(chart.tips).toHaveLength(7);
    expect(chart.tips![0]!.rows.map((r) => r.label)).toEqual(['Tritanium']);
    expect(chart.tips!.at(-1)!.rows.map((r) => r.label)).toEqual(['Tritanium', 'PLEX']);
  });

  it('omits an item with no history from the chart but keeps its row, and says so', () => {
    const none = line(9, 'Nothing', []);
    const view = marketTrend(data([rising, none]), ctx());
    expect(view.table!.rows).toHaveLength(2);
    expect(view.table!.rows[1]!.cells[1]).toBe('—');
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.series).toHaveLength(1);
    expect(view.chart.note).toContain('noteNoHistory');
    expect(view.chart.note).toContain('Nothing');
    expect(view.table!.footer).toContain('Nothing');
  });

  it('tells a failed read from a missing market', () => {
    const failed = { ...line(9, 'Broken', []), failed: true };
    const none = line(8, 'Nothing', []);
    const view = marketTrend(data([rising, failed, none]), ctx());
    expect(view.table!.rows[1]!.cells[1]).toBe('overview.widgets.data.marketTrend.failedCell');
    expect(view.table!.rows[2]!.cells[1]).toBe('—');
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.note).toMatch(/noteFailed[^}]*Broken/);
    expect(view.chart.note).toMatch(/noteNoHistory[^}]*Nothing/);
    expect(view.chart.note).not.toMatch(/noteFailed[^}]*Nothing/);
  });

  it('names the global market, not the hubs, when every line is global', () => {
    const view = marketTrend(data([short]), ctx(30, { trendItems: [44992], trendHubs: ['jita'] }));
    expect(view.table!.footer).toContain('whereGlobal');
    expect(view.table!.footer).not.toContain('Jita');
    expect(view.summary).not.toContain('Jita');
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.note).toBeUndefined();
    expect(view.chart.summary).not.toContain('Jita');
  });

  it('carries no explanatory sentence, nor a low/high row, when there is nothing to warn about', () => {
    const view = marketTrend(data([rising, short]), ctx(7));
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.note).toBeUndefined();
    expect(view.chart.low).toBeUndefined();
    expect(view.chart.high).toBeUndefined();
  });

  it('never reads a zero-average day as a -100% crash or the headline mover', () => {
    const crashed = line(35, 'Pyroxeres', [10, 10, 10, 10, 10, 10, 10, 10, 0]);
    const view = marketTrend(data([crashed, rising]), ctx(7));
    expect(view.table!.rows[0]!.cells[1]).toEqual(expect.objectContaining({ iskAmount: 10 }));
    expect(view.table!.rows[0]!.cells[2]).toBe('0.0%');
    expect(view.number.value).toBe('+5.7%');
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    const pyro = view.chart.series.find((s) => s.label === 'Pyroxeres')!;
    expect(pyro.values.filter((v) => v !== null && v <= -99)).toEqual([]);
    expect(pyro.end).toBe('0.0%');
  });

  it('treats an item whose every day is zero as having no history', () => {
    const view = marketTrend(data([rising, line(9, 'Dead', [0, 0, 0])]), ctx(7));
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.series).toHaveLength(1);
    expect(view.chart.note).toContain('Dead');
  });

  it('plots a 7-day average on long ranges while the tooltip keeps the real day', () => {
    const zigzag = line(
      36,
      'Zig',
      Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 100 : 120))
    );
    const long = marketTrend(data([zigzag]), ctx(30));
    const raw = marketTrend(data([zigzag]), ctx(7));
    if (long.chart?.kind !== 'lines' || raw.chart?.kind !== 'lines') throw new Error('lines');
    expect(long.chart.summary).toContain('summarySmoothed');
    expect(raw.chart.summary).not.toContain('summarySmoothed');
    const tail = long.chart.series[0]!.values.slice(7).map((x) => x ?? 0);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(5); // raw swings by 20 points
    expect(long.chart.series[0]!.values[0]).toBe(0);
    // Tooltip is the day's own price, not the average.
    expect(long.chart.tips!.at(-1)!.rows[0]!.value).toContain('"price":"100"');
  });

  it('keeps the hub names for a mix of global and hub lines', () => {
    const view = marketTrend(data([rising, short]), ctx());
    expect(view.table!.footer).toContain('whereHub');
  });

  it('surfaces lines dropped by the cap on the table and chart, not only the Number view', () => {
    const many = Array.from({ length: 8 }, (_, i) => line(100 + i, `Item ${i}`, [1, 2]));
    const view = marketTrend(data([rising, ...many]), ctx());
    const omitted = 'overview.widgets.data.marketTrend.omitted{"count":3}';
    expect(view.table!.footer).toContain(omitted);
    if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
    expect(view.chart.note).toContain(omitted);
  });

  it('puts the biggest 7 day mover in the Number view and flags the age-out', () => {
    const many = Array.from({ length: 8 }, (_, i) => line(100 + i, `Item ${i}`, [1, 2]));
    const view = marketTrend(data([rising, ...many]), ctx());
    expect(view.number.value).toBe('+5.7%');
    expect(view.number.notes).toEqual(['overview.widgets.data.marketTrend.omitted{"count":3}']);
  });

  describe('a widget with its own picks', () => {
    const jitaTri = rising;
    const amarrTri = line(
      34,
      'Tritanium',
      Array.from({ length: 31 }, (_, i) => 90 + i * 2),
      'amarr'
    );
    const injector = line(40520, 'Large Skill Injector', [8e8, 9e8]);
    const all = data([jitaTri, amarrTri, injector, short], {}, [{ typeId: 34, name: 'Tritanium' }]);

    it('draws only the items it names, whatever the Quickbar holds', () => {
      const view = marketTrend(all, ctx(30, { trendItems: [40520] }));
      expect(view.table!.rows.map((r) => r.key)).toEqual(['40520@jita']);
    });

    it('draws one line per hub for an item, labelled by hub', () => {
      const view = marketTrend(all, ctx(30, { trendItems: [34], trendHubs: ['jita', 'amarr'] }));
      expect(view.table!.rows.map((r) => r.cells[0])).toEqual([
        'Tritanium · Jita',
        'Tritanium · Amarr',
      ]);
      expect(view.table!.footer).toBe(
        'overview.widgets.data.marketTrend.footer{"where":"overview.widgets.chart.marketTrend.whereHub{\\"hub\\":\\"Jita, Amarr\\"}"}'
      );
    });

    it('draws a global-market item once however many hubs', () => {
      const view = marketTrend(all, ctx(30, { trendItems: [44992], trendHubs: ['jita', 'amarr'] }));
      expect(view.table!.rows).toHaveLength(1);
      expect(view.table!.rows[0]!.cells[0]).toBe('PLEX');
    });

    it('waits, rather than draw part of the lines, for a pick the feed has not read', () => {
      const view = marketTrend(all, ctx(30, { trendItems: [34, 99] }));
      expect(view.status.loading).toBe(true);
      expect(view.table).toBeUndefined();
    });

    it('shows an error, not a spinner, when a reload failed before the new picks arrived', () => {
      const failed = { marketTrend: { ...all.marketTrend, error: true } };
      const view = marketTrend(failed, ctx(30, { trendItems: [34, 99] }));
      expect(view.status.error).toBe(true);
      expect(view.status.loading).toBe(false);
    });

    it('spans a year', () => {
      const view = marketTrend(all, ctx(365, { trendItems: [34] }));
      if (view.chart?.kind !== 'lines') throw new Error('expected a lines chart');
      expect(view.chart.series).toHaveLength(1);
    });
  });
});
