import { describe, expect, it } from 'vitest';
import {
  clipOpenPrices,
  joinOpenPrices,
  openPricePoints,
  seriesShows,
  summarizeOpenPrices,
  PRICE_SERIES_CHOICES,
} from './priceHistoryOpen';
import type { MarketHistoryPoint } from './priceHistory';
import { joinRegionAverages } from './priceHistoryCompare';

function day(date: string, average = 100): MarketHistoryPoint {
  return { date, average, highest: average + 5, lowest: average - 5, volume: 10, orderCount: 3 };
}

describe('openPricePoints', () => {
  it('zips the parallel arrays into dated points, oldest first', () => {
    expect(
      openPricePoints({
        dates: ['2026-10-02', '2026-10-01'],
        buy: [9, 8],
        sell: [12, null],
      })
    ).toEqual([
      { date: '2026-10-01', buy: 8, sell: null },
      { date: '2026-10-02', buy: 9, sell: 12 },
    ]);
  });

  it('drops days with neither price, and reads a short or non-finite array as null', () => {
    expect(
      openPricePoints({
        dates: ['2026-10-01', '2026-10-02', '2026-10-03'],
        buy: [null, 5, Number.NaN],
        sell: [null, 6],
      })
    ).toEqual([{ date: '2026-10-02', buy: 5, sell: 6 }]);
  });
});

describe('clipOpenPrices', () => {
  it('keeps the days inside the range, like the ESI history does', () => {
    const points = [
      { date: '2026-09-01', buy: 1, sell: 2 },
      { date: '2026-10-15', buy: 3, sell: 4 },
    ];
    expect(clipOpenPrices(points, '7d', new Date('2026-10-18T12:00:00Z'))).toEqual([points[1]]);
  });
});

describe('joinOpenPrices', () => {
  it('lays each region buy and sell on the days of ESI history, adding days only the open series has', () => {
    const days = joinOpenPrices(joinRegionAverages([day('2026-10-01'), day('2026-10-03')], []), [
      { regionId: 10, points: [{ date: '2026-10-02', buy: 7, sell: 9 }] },
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(days[0]!.primary?.average).toBe(100);
    expect(days[1]!.primary).toBeUndefined();
    expect(days[1]!.buy).toEqual({ 10: 7 });
    expect(days[1]!.sell).toEqual({ 10: 9 });
  });

  it('leaves a missing side out rather than writing a zero', () => {
    const [d] = joinOpenPrices(joinRegionAverages([day('2026-10-01')], []), [
      { regionId: 10, points: [{ date: '2026-10-01', buy: null, sell: 9 }] },
    ]);
    expect(d!.buy).toEqual({});
    expect(d!.sell).toEqual({ 10: 9 });
  });
});

describe('summarizeOpenPrices', () => {
  it('reports the median of each side, null for a side with no prices', () => {
    expect(
      summarizeOpenPrices([
        { date: 'a', buy: 1, sell: null },
        { date: 'b', buy: 3, sell: null },
        { date: 'c', buy: 2, sell: null },
      ])
    ).toEqual({ buyMedian: 2, sellMedian: null });
  });

  it('is null for no points', () => {
    expect(summarizeOpenPrices([])).toBeNull();
  });
});

describe('seriesShows', () => {
  it('maps the choice to the sides drawn', () => {
    expect(seriesShows('both', 'buy')).toBe(true);
    expect(seriesShows('both', 'sell')).toBe(true);
    expect(seriesShows('buy', 'sell')).toBe(false);
    expect(seriesShows('sell', 'sell')).toBe(true);
  });

  it('offers Average last, which draws neither open side', () => {
    expect(PRICE_SERIES_CHOICES).toEqual(['both', 'buy', 'sell', 'average']);
    expect(seriesShows('average', 'buy')).toBe(false);
    expect(seriesShows('average', 'sell')).toBe(false);
  });
});
