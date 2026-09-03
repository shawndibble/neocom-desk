import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MaterialCostLine } from '@/engine/industry/types';

/**
 * CSV columns for the materials list: name, effective (post-ME) quantity,
 * unit price, line total. Reads the engine's resolved cost line rather than
 * re-pricing from the hub, so the export matches what MaterialsTable shows
 * once a material has sourcing overrides — an override price exports as the
 * unit price, and an owned portion is already out of `lineCost`.
 *
 * A material with no price at all, or any material when prices failed to load,
 * emits a blank cell (not a display string like "No price") for both price
 * columns. A blank lets a spreadsheet SUM() skip the row; a string would poison
 * the column into text. A fully owned row is the exception: it costs zero
 * whether or not anything is priced, so it exports a real 0.
 */
export function materialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string,
  pricesReady: boolean
): CsvColumn<MaterialCostLine>[] {
  function unitPrice(material: MaterialCostLine): number | null {
    return pricesReady && material.unitPrice !== null ? material.unitPrice : null;
  }

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
      value: (material) => unitPrice(material),
    },
    {
      header: t('industry.csvLineTotalIsk'),
      value: (material) =>
        material.remainingQuantity === 0
          ? material.lineCost
          : unitPrice(material) === null
            ? null
            : material.lineCost,
    },
  ];
}
