import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { AppraisalRow } from '@/engine/market/appraisal';

/**
 * CSV columns for the Appraisal tab. Prices are raw numbers already scaled to
 * the chosen percentage — same convention as `compareCsvColumns` and
 * `orderBookCsvColumns`, so a spreadsheet gets figures it can total rather
 * than `formatIsk` strings it cannot.
 *
 * A side with no orders exports empty, not zero: `null` is "nobody is trading
 * this", and a 0 in a spreadsheet column is a price someone will sum.
 */
export function appraisalCsvColumns(t: CsvTranslate): CsvColumn<AppraisalRow>[] {
  return [
    { header: t('market.appraisal.columnQuantity'), value: (row) => row.quantity },
    { header: t('market.appraisal.columnItem'), value: (row) => row.name },
    { header: t('market.appraisal.columnBuyEach'), value: (row) => row.buyEach },
    { header: t('market.appraisal.columnSellEach'), value: (row) => row.sellEach },
    { header: t('market.appraisal.columnBuyTotal'), value: (row) => row.buyTotal },
    { header: t('market.appraisal.columnSellTotal'), value: (row) => row.sellTotal },
  ];
}
