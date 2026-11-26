import { median } from '../math';
import { filterPriceHistoryRange, type PriceHistoryRange } from './priceHistory';
import type { ComparedHistoryDay } from './priceHistoryCompare';

export interface OpenPriceSeries {
  dates: readonly string[];
  buy: readonly (number | null)[];
  sell: readonly (number | null)[];
}

export interface OpenPricePoint {
  date: string;
  buy: number | null;
  sell: number | null;
}

export type PriceSeriesChoice = 'both' | 'buy' | 'sell' | 'average';

export const PRICE_SERIES_CHOICES: readonly PriceSeriesChoice[] = [
  'both',
  'buy',
  'sell',
  'average',
];

export type OpenPriceSide = 'buy' | 'sell';

export function seriesShows(choice: PriceSeriesChoice, side: OpenPriceSide): boolean {
  return choice === 'both' || choice === side;
}

function priceOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function openPricePoints(series: OpenPriceSeries): OpenPricePoint[] {
  const points: OpenPricePoint[] = [];
  series.dates.forEach((date, i) => {
    const buy = priceOrNull(series.buy[i]);
    const sell = priceOrNull(series.sell[i]);
    if (buy === null && sell === null) return;
    points.push({ date, buy, sell });
  });
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function clipOpenPrices(
  points: readonly OpenPricePoint[],
  range: PriceHistoryRange,
  now: Date
): OpenPricePoint[] {
  return filterPriceHistoryRange(points, range, now);
}

export interface RegionOpenSeries {
  regionId: number;
  station?: string;
  points: readonly OpenPricePoint[];
}

export interface OpenJoinedDay extends ComparedHistoryDay {
  buy: Readonly<Record<number, number>>;
  sell: Readonly<Record<number, number>>;
}

export function joinOpenPrices(
  days: readonly ComparedHistoryDay[],
  open: readonly RegionOpenSeries[]
): OpenJoinedDay[] {
  const byDate = new Map<
    string,
    { day: ComparedHistoryDay; buy: Record<number, number>; sell: Record<number, number> }
  >(days.map((day) => [day.date, { day, buy: {}, sell: {} }]));
  for (const series of open) {
    for (const p of series.points) {
      let entry = byDate.get(p.date);
      if (!entry) {
        entry = { day: { date: p.date, primary: undefined, averages: {} }, buy: {}, sell: {} };
        byDate.set(p.date, entry);
      }
      if (p.buy !== null) entry.buy[series.regionId] = p.buy;
      if (p.sell !== null) entry.sell[series.regionId] = p.sell;
    }
  }
  return [...byDate.values()]
    .map(({ day, buy, sell }) => ({ ...day, buy, sell }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface OpenPriceSummary {
  buyMedian: number | null;
  sellMedian: number | null;
}

export function summarizeOpenPrices(points: readonly OpenPricePoint[]): OpenPriceSummary | null {
  if (points.length === 0) return null;
  const medianOfPresent = (values: (number | null)[]): number | null => {
    const present = values.filter((v): v is number => v !== null);
    return present.length === 0 ? null : median(present);
  };
  return {
    buyMedian: medianOfPresent(points.map((p) => p.buy)),
    sellMedian: medianOfPresent(points.map((p) => p.sell)),
  };
}
