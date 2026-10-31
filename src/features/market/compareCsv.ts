import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CompareRow } from './useCompareRows';

/**
 * CSV columns for the Compare Drawer: item, best sell/buy, spread, spread %,
 * spread after the Character's fees, available volume. Prices/spread are raw numbers (`summary.*`), not `formatIsk`
 * strings — same convention as `orderBookCsvColumns`/`variationsCsvColumns`.
 * A row still loading, or whose fetch failed, exports its price cells empty
 * rather than the drawer's `…`/`—` display placeholders.
 */
export function compareCsvColumns(
  t: CsvTranslate,
  /** The drawer's spread % and after-fees figure (null without the Character's skills, never a base-rate guess). */
  marginFor: (row: CompareRow) => { spreadPct: number | null; afterFees: number | null }
): CsvColumn<CompareRow>[] {
  return [
    { header: t('market.compare.columnItem'), value: (row) => row.itemName },
    { header: t('market.compare.columnBestSell'), value: (row) => row.summary?.bestSell },
    { header: t('market.compare.columnBestBuy'), value: (row) => row.summary?.bestBuy },
    { header: t('market.compare.columnSpread'), value: (row) => row.summary?.spread },
    { header: t('market.compare.columnSpreadPct'), value: (row) => marginFor(row).spreadPct },
    { header: t('market.compare.columnAfterFees'), value: (row) => marginFor(row).afterFees },
    { header: t('market.compare.columnVolume'), value: (row) => row.summary?.availableVolume },
  ];
}
