import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  iskPerM3,
  type AppraisalNetFees,
  type AppraisalRow,
  type RefineBasis,
} from '@/engine/market/appraisal';
import { rowFigures, type RowFigures } from '@/engine/market/appraisalRowFigures';
import type { OwnedRow } from '@/engine/market/appraisalOwned';
import { priceMarkKey } from './priceStateLabel';

interface AppraisalCsvOptions {
  /**
   * Adds Sales tax, Broker fee and Sell after fees. `null` = skills not known
   * yet, so the cells are blank (never a base-rate guess); omitted = this view
   * has no fee context at all (a Shared Appraisal), so the columns are left out.
   */
  fees?: AppraisalNetFees | null;
  /**
   * Adds the columns only the live tab has data for: refine total, LP store,
   * need, owned and price source. Omitted on a Shared Appraisal, which carries
   * none of them, so its file has no always-empty columns. The refine
   * figures are priced on `refineBasis`, the pilot's remembered Price Basis,
   * the same as the table's Refine columns.
   */
  live?: { refineBasis: RefineBasis };
}

/**
 * CSV columns for the Appraisal tab. Prices are raw numbers already scaled to
 * the chosen percentage — same convention as `compareCsvColumns` and
 * `orderBookCsvColumns`, so a spreadsheet gets figures it can total rather
 * than `formatIsk` strings it cannot.
 *
 * A side with no orders exports empty, not zero: `null` is "nobody is trading
 * this", and a 0 in a spreadsheet column is a price someone will sum.
 */
export function appraisalCsvColumns(
  t: CsvTranslate,
  { fees, live }: AppraisalCsvOptions = {}
): CsvColumn<OwnedRow>[] {
  // The basis only moves the refine figures, which a Shared Appraisal's file leaves out.
  const basis: RefineBasis = live?.refineBasis ?? 'buy';
  const figures = (row: AppraisalRow): RowFigures => rowFigures(row, basis, fees ?? null);
  const columns: CsvColumn<OwnedRow>[] = [
    { header: t('market.appraisal.columnQuantity'), value: (row) => row.quantity },
    { header: t('market.appraisal.columnItem'), value: (row) => row.name },
    { header: t('market.appraisal.columnBuyEach'), value: (row) => row.buyEach },
    { header: t('market.appraisal.columnSellEach'), value: (row) => row.sellEach },
    { header: t('market.appraisal.columnSplitEach'), value: (row) => figures(row).splitEach },
    { header: t('market.appraisal.columnBuyTotal'), value: (row) => row.buyTotal },
    { header: t('market.appraisal.columnSellTotal'), value: (row) => row.sellTotal },
    // Packaged m³ (issue #2337); unknown exports empty, the same as an unpriced side.
    { header: t('market.appraisal.columnVolume'), value: (row) => row.volume },
    { header: t('market.appraisal.columnIskPerM3'), value: (row) => iskPerM3(row) },
  ];
  if (live !== undefined) {
    columns.push(
      // Blank where the type has no reprocessing data / no held LP store sells it.
      {
        header: t('market.appraisal.columnRefineTotal'),
        value: (row) => figures(row).refine.minerals,
      },
      {
        header: t('market.appraisal.columnRefineWithLeftover'),
        value: (row) => figures(row).refine.withLeftover,
      },
      { header: t('market.appraisal.columnLpTotal'), value: (row) => row.lpIskCost },
      { header: t('market.appraisal.columnLpCost'), value: (row) => row.lpCost },
      { header: t('market.appraisal.columnLpCorp'), value: (row) => row.lpCorpName },
      // Blank unless the pilot's assets were subtracted from the list.
      { header: t('market.appraisal.columnNeed'), value: (row) => row.need },
      { header: t('market.appraisal.columnOwned'), value: (row) => row.owned },
      {
        header: t('market.appraisal.columnPriceState'),
        // Only a price that is not live carries a mark on screen.
        value: (row) => {
          const key = priceMarkKey(row.priceState);
          return key === null ? null : t(key);
        },
      }
    );
  }
  if (fees !== undefined) {
    // Blank until the skills are known (`fees` null), never a base-rate guess.
    columns.push(
      {
        header: t('market.appraisal.columnSalesTax'),
        value: (row) => figures(row).fees.salesTax,
      },
      {
        header: t('market.appraisal.columnBrokerFee'),
        value: (row) => figures(row).fees.brokerFee,
      },
      {
        header: t('market.appraisal.columnSellAfterFees'),
        value: (row) => figures(row).fees.afterFees,
      }
    );
  }
  return columns;
}
