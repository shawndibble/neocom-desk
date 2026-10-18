import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { priceHistoryCsvColumns } from './priceHistoryCsv';

const t = (k: string) => k;

const POINT: MarketHistoryPoint = {
  date: '2026-09-01',
  average: 4.87,
  highest: 5.1,
  lowest: 4.5,
  volume: 1_250_000,
  orderCount: 312,
};

describe('priceHistoryCsvColumns', () => {
  it('orders columns date, average, low, high, volume, orders', () => {
    expect(priceHistoryCsvColumns(t).map((c) => c.header)).toEqual([
      'market.priceHistory.date',
      'market.priceHistory.average',
      'market.priceHistory.summaryLo',
      'market.priceHistory.summaryHi',
      'market.priceHistory.volume',
      'market.priceHistory.orderCount',
    ]);
  });

  it('writes the day as a real date and every figure as a raw number', () => {
    const csv = toCsv([POINT], priceHistoryCsvColumns(t));
    expect(csv.split('\r\n')[1].split(',')).toEqual([
      '2026-09-01 00:00:00',
      '4.87',
      '4.5',
      '5.1',
      '1250000',
      '312',
    ]);
  });

  it('adds one average column per compared region, blank on a day that region did not trade', () => {
    const tr = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${String(o.region)}` : k);
    const columns = priceHistoryCsvColumns(tr, [
      { regionId: 10000043, name: 'Domain' },
      { regionId: 10000032, name: 'Sinq Laison' },
    ]);
    expect(columns.slice(6).map((c) => c.header)).toEqual([
      'market.priceHistory.regionAverageColumn:Domain',
      'market.priceHistory.regionAverageColumn:Sinq Laison',
    ]);
    const csv = toCsv([{ ...POINT, comparison: { 10000043: 4.9 } }], columns);
    expect(csv.split('\r\n')[1].split(',').slice(6)).toEqual(['4.9', '']);
  });

  it("puts Buy and Sell after the average for each region with an open series, and drops that region's average column", () => {
    const tr = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${String(o.region)}` : k);
    const columns = priceHistoryCsvColumns(
      tr,
      [{ regionId: 10000043, name: 'Domain', open: true }],
      [
        { regionId: 10000002, name: 'The Forge' },
        { regionId: 10000043, name: 'Domain' },
      ]
    );
    expect(columns.map((c) => c.header)).toEqual([
      'market.priceHistory.date',
      'market.priceHistory.average',
      'market.priceHistory.regionBuy:The Forge',
      'market.priceHistory.regionSell:The Forge',
      'market.priceHistory.regionBuy:Domain',
      'market.priceHistory.regionSell:Domain',
      'market.priceHistory.summaryLo',
      'market.priceHistory.summaryHi',
      'market.priceHistory.volume',
      'market.priceHistory.orderCount',
    ]);
    const row = {
      ...POINT,
      buy: { 10000002: 4.4, 10000043: 4.3 },
      sell: { 10000002: 5.2 },
    };
    expect(toCsv([row], columns).split('\r\n')[1].split(',').slice(2, 6)).toEqual([
      '4.4',
      '5.2',
      '4.3',
      '',
    ]);
  });

  it('names the sides plainly when only one region is shown', () => {
    const columns = priceHistoryCsvColumns(t, [], [{ regionId: 10000002 }]);
    expect(columns.slice(2, 4).map((c) => c.header)).toEqual([
      'market.priceHistory.openBuy',
      'market.priceHistory.openSell',
    ]);
  });
});
