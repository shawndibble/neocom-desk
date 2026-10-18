import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { openSideLabel } from './priceHistoryLabels';

/** A day of the primary region's history, with each compared region's average that day keyed by region id. */
export interface PriceHistoryTableRow extends Partial<Omit<MarketHistoryPoint, 'date'>> {
  /** A day with an open price but no ESI trade has a date and nothing else of ESI's. */
  date: string;
  comparison?: Readonly<Record<number, number>>;
  /** Each region's open buy and sell that day, by region id (the primary region's included). */
  buy?: Readonly<Record<number, number>>;
  sell?: Readonly<Record<number, number>>;
}

export interface ComparedRegionLabel {
  regionId: number;
  name: string;
  /** The region has an open series: its Buy and Sell columns replace its average column. */
  open?: boolean;
}

/** A region whose open buy and sell the table carries as columns. */
export interface OpenRegionLabel {
  regionId: number;
  /** Named in the header only when regions are compared. */
  name?: string;
}

/**
 * CSV columns for the Price History day table: date, average, the day's low
 * and high (the table's one "range" cell split in two, so each sorts and
 * sums), volume, order count. ESI's bare `YYYY-MM-DD` day goes out as that
 * day's UTC midnight, so it lands as a real date rather than text.
 *
 * Then one average column per compared region, on the primary region's days:
 * the day list stays the primary region's, and a comparison is exported
 * beside it rather than as rows of its own. Blank on a day that region did
 * not trade — never a 0 it did not report.
 */
export function priceHistoryCsvColumns(
  t: CsvTranslate,
  compared: readonly ComparedRegionLabel[] = [],
  openRegions: readonly OpenRegionLabel[] = []
): CsvColumn<PriceHistoryTableRow>[] {
  return [
    { header: t('market.priceHistory.date'), value: (p) => `${p.date}T00:00:00Z` },
    { header: t('market.priceHistory.average'), value: (p) => p.average },
    // The open prices, then the day's trade facts: blank where no order stood.
    ...openRegions.flatMap(({ regionId, name }): CsvColumn<PriceHistoryTableRow>[] => [
      { header: openSideLabel(t, 'buy', name), value: (p) => p.buy?.[regionId] },
      { header: openSideLabel(t, 'sell', name), value: (p) => p.sell?.[regionId] },
    ]),
    { header: t('market.priceHistory.summaryLo'), value: (p) => p.lowest },
    { header: t('market.priceHistory.summaryHi'), value: (p) => p.highest },
    { header: t('market.priceHistory.volume'), value: (p) => p.volume },
    { header: t('market.priceHistory.orderCount'), value: (p) => p.orderCount },
    ...compared
      .filter((c) => !c.open)
      .map(({ regionId, name }): CsvColumn<PriceHistoryTableRow> => ({
        header: t('market.priceHistory.regionAverageColumn', { region: name }),
        value: (p) => p.comparison?.[regionId],
      })),
  ];
}
