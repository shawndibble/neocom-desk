import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

/** A day of the primary region's history, with each compared region's average that day keyed by region id. */
export interface PriceHistoryTableRow extends MarketHistoryPoint {
  comparison?: Readonly<Record<number, number>>;
}

export interface ComparedRegionLabel {
  regionId: number;
  name: string;
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
  compared: readonly ComparedRegionLabel[] = []
): CsvColumn<PriceHistoryTableRow>[] {
  return [
    { header: t('market.priceHistory.date'), value: (p) => `${p.date}T00:00:00Z` },
    { header: t('market.priceHistory.average'), value: (p) => p.average },
    { header: t('market.priceHistory.summaryLo'), value: (p) => p.lowest },
    { header: t('market.priceHistory.summaryHi'), value: (p) => p.highest },
    { header: t('market.priceHistory.volume'), value: (p) => p.volume },
    { header: t('market.priceHistory.orderCount'), value: (p) => p.orderCount },
    ...compared.map(({ regionId, name }): CsvColumn<PriceHistoryTableRow> => ({
      header: t('market.priceHistory.regionAverageColumn', { region: name }),
      value: (p) => p.comparison?.[regionId],
    })),
  ];
}
