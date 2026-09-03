import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { materialRowState } from './materialRow';

/**
 * CSV columns for the materials list: name, effective (post-ME) quantity,
 * unit price, line total. The price columns come from `materialRowState`, the
 * same decision MaterialsTable renders, so an export can't disagree with the
 * table it was taken from — an override price exports as the unit price, and
 * an owned portion is already out of the line total.
 *
 * A cell with nothing to say is blank (not a display string like "No price"):
 * a blank lets a spreadsheet SUM() skip the row, a string would poison the
 * column into text. A fully owned row is the exception — it costs zero whether
 * or not anything is priced, so it exports a real 0.
 */
export function materialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string,
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean
): CsvColumn<MaterialCostLine>[] {
  return [
    {
      header: t('industry.csvMaterial'),
      value: (material) => nameFor(material.typeID),
    },
    {
      header: t('industry.csvQuantity'),
      value: (material) => material.quantity,
    },
    {
      header: t('industry.csvUnitPriceIsk'),
      value: (material) => materialRowState(material, sourcing, pricesReady).unitPrice,
    },
    {
      header: t('industry.csvLineTotalIsk'),
      value: (material) => materialRowState(material, sourcing, pricesReady).lineCost,
    },
  ];
}
