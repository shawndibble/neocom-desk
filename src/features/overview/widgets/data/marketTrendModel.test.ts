import { describe, expect, it } from 'vitest';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { marketTrend, trendText } from './marketTrendModel';
import type { MarketTrendItem, MarketTrendWidgetData } from './kindLoaders';
import type { BuildContext, FeedState } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (range: 7 | 30 | 90 = 30): BuildContext => ({
  t,
  now: Date.parse('2026-10-24T12:00:00Z'),
  activeCharacterId: 91,
  scopeAll: false,
  notTrainingAlert: false,
  range,
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
const item = (typeId: number, name: string, averages: number[]): MarketTrendItem => ({
  typeId,
  name,
  points: averages.map((a, i) => pt(day(24 - averages.length + 1 + i), a)),
  to: `/market/browser?type=${typeId}&hub=jita`,
  fromCache: false,
});
const data = (items: MarketTrendItem[], patch: Partial<MarketTrendWidgetData> = {}) => ({
  marketTrend: ok<MarketTrendWidgetData>({
    hubName: 'Jita',
    items,
    omitted: 0,
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
  const rising = item(
    34,
    'Tritanium',
    Array.from({ length: 31 }, (_, i) => 100 + i)
  );
  const short = item(44992, 'PLEX', [5_000_000, 5_100_000]);

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

  it('omits an item with no history from the chart but keeps its row', () => {
    const none = { ...item(9, 'Nothing', []), points: [] };
    const view = marketTrend(data([rising, none]), ctx());
    expect(view.table!.rows).toHaveLength(2);
    expect(view.table!.rows[1]!.cells[1]).toBe('—');
    if (view.chart?.kind === 'lines') expect(view.chart.series).toHaveLength(1);
  });

  it('puts the biggest 7 day mover in the Number view and flags the age-out', () => {
    const view = marketTrend(data([rising], { omitted: 2 }), ctx());
    expect(view.number.value).toBe('+5.7%');
    expect(view.number.notes).toEqual(['overview.widgets.data.marketTrend.omitted{"count":2}']);
  });
});
