import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CompareRow } from './useCompareRows';

export function compareCsvColumns(
  t: CsvTranslate,
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
