import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OwnedStockSaleLine } from '@/engine/industry/ownedStockSale';

/** Export columns for Results' "Use or sell" per-material table, in its order, figures raw. */
export function ownedSaleCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string
): CsvColumn<OwnedStockSaleLine>[] {
  return [
    { header: t('industry.material'), value: (row) => nameFor(row.typeID) },
    { header: t('industry.useOrSell.ownedUnits'), value: (row) => row.quantity },
    { header: t('industry.unitPrice'), value: (row) => row.unitPrice },
    { header: t('industry.useOrSell.netColumn'), value: (row) => row.net },
  ];
}
