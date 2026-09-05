import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import type { VariationRow } from './variations';

/**
 * CSV columns for the Variations table: name, tier, best sell/buy. `sell`
 * and `buy` are raw numbers (`bestSell`/`bestBuy`), not `formatIsk` strings —
 * same convention as `orderBookCsvColumns`. A row whose price hasn't
 * resolved yet (absent from `prices`, or present but still loading) exports
 * as an empty cell rather than a loading placeholder string.
 */
export function variationsCsvColumns(
  t: CsvTranslate,
  prices: ReadonlyMap<number, OrderBookSummary | undefined>
): CsvColumn<VariationRow>[] {
  return [
    { header: t('market.variations.name'), value: (row) => row.name },
    { header: t('market.variations.tier'), value: (row) => row.tier },
    { header: t('market.variations.sell'), value: (row) => prices.get(row.typeId)?.bestSell },
    { header: t('market.variations.buy'), value: (row) => prices.get(row.typeId)?.bestBuy },
  ];
}
