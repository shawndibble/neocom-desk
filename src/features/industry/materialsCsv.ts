import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { materialRowState } from './materialRow';

/**
 * CSV columns for the materials list: name, effective (post-ME) quantity,
 * unit price, line total. The price columns come from `materialRowState`, the
 * same decision MaterialsTable renders, so an export can't disagree with the
 * table it was taken from — an override price exports as the unit price, and
 * an owned portion is already out of the line total.
 *
 * The make-or-buy verdict exports as the same one-word Build/Buy the row's
 * marker announces, so a materials list taken into a spreadsheet still says
 * which lines are worth producing. Only the verdict, not the quote behind it:
 * the sub-job's own cost is not actionable without the rest of that job.
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
  pricesReady: boolean,
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>
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
    {
      header: t('industry.csvMakeOrBuy'),
      value: (material) => {
        const advice = makeOrBuy?.get(material.typeID);
        return advice ? t(`industry.makeOrBuy.${advice.verdict}`) : null;
      },
    },
  ];
}
