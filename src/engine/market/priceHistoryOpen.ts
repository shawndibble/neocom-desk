/**
 * Daily open prices for the Price History chart: the highest buy order and the
 * lowest sell order standing at the end of each UTC day, as the
 * R2 `open-prices/<typeId>.json` objects store them (docs/context/decisions/
 * 20261018-121126-price-history-draws-daily-open-buy-and-sell.md). ESI history
 * only records trades, so it cannot say this. Pure — the loader adapts the
 * stored document.
 */
import { median } from '../math';
import { filterPriceHistoryRange, type PriceHistoryRange } from './priceHistory';
import type { ComparedHistoryDay } from './priceHistoryCompare';

/** One region of a stored type document: parallel arrays, `null` where no order stood that day. */
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

/**
 * Which lines the chart draws: open buy and/or sell where a region has them,
 * or `average` — every region's ESI average, so a trade hub and a region
 * without open prices compare on the same footing.
 */
export type PriceSeriesChoice = 'both' | 'buy' | 'sell' | 'average';

export const PRICE_SERIES_CHOICES: readonly PriceSeriesChoice[] = [
  'both',
  'buy',
  'sell',
  'average',
];

export type OpenPriceSide = 'buy' | 'sell';

/** Whether `side`'s line is drawn under `choice`; never under `average`. */
export function seriesShows(choice: PriceSeriesChoice, side: OpenPriceSide): boolean {
  return choice === 'both' || choice === side;
}

function priceOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The parallel arrays as dated points, oldest first; a day with neither price is dropped and a short array reads as null. */
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

/** Keeps the days inside `range`, on the same cutoff as ESI's history. */
export function clipOpenPrices(
  points: readonly OpenPricePoint[],
  range: PriceHistoryRange,
  now: Date
): OpenPricePoint[] {
  return filterPriceHistoryRange(points, range, now);
}

export interface RegionOpenSeries {
  regionId: number;
  /**
   * The hub station whose orders these are ("Jita 4-4"), which names the
   * region's Buy and Sell lines.
   */
  station?: string;
  points: readonly OpenPricePoint[];
}

export interface OpenJoinedDay extends ComparedHistoryDay {
  /** Each region's highest buy order that day, by region id; absent where none stood. */
  buy: Readonly<Record<number, number>>;
  /** Each region's lowest sell order that day, by region id. */
  sell: Readonly<Record<number, number>>;
}

/**
 * The joined ESI days (`joinRegionAverages`) plus each region's open buy and
 * sell, over the union of their dates, ascending. The open series is recorded
 * for days ESI saw no trade, and the line should still pass through them.
 */
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

/** The typical day's open buy and sell. Null for no points — never a fabricated 0. */
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
