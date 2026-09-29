import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

/**
 * CSV columns for the Price History day table: date, average, the day's low
 * and high (the table's one "range" cell split in two, so each sorts and
 * sums), volume, order count. ESI's bare `YYYY-MM-DD` day goes out as that
 * day's UTC midnight, so it lands as a real date rather than text.
 */
export function priceHistoryCsvColumns(t: CsvTranslate): CsvColumn<MarketHistoryPoint>[] {
  return [
    { header: t('market.priceHistory.date'), value: (p) => `${p.date}T00:00:00Z` },
    { header: t('market.priceHistory.average'), value: (p) => p.average },
    { header: t('market.priceHistory.summaryLo'), value: (p) => p.lowest },
    { header: t('market.priceHistory.summaryHi'), value: (p) => p.highest },
    { header: t('market.priceHistory.volume'), value: (p) => p.volume },
    { header: t('market.priceHistory.orderCount'), value: (p) => p.orderCount },
  ];
}
