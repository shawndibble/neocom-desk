import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  iskPerM3,
  sellAfterFees,
  sellBrokerFee,
  sellSalesTax,
  splitEach,
  type AppraisalRow,
} from '@/engine/market/appraisal';
import type { ResolvedStandings } from '@/engine/market/standings';

/** What the fee columns price with: the active Character's skills and standing at the hub. */
export interface AppraisalCsvFees {
  accountingLevel: number;
  brokerRelationsLevel: number;
  standing: ResolvedStandings;
}

/** A row that may carry what the pilot already owns (`subtractOwned`). */
type AppraisalCsvRow = AppraisalRow & { owned?: number; need?: number };

interface AppraisalCsvOptions {
  /**
   * Adds Sales tax, Broker fee and Sell after fees. `null` = skills not known
   * yet, so the cells are blank (never a base-rate guess); omitted = this view
   * has no fee context at all (a Shared Appraisal), so the columns are left out.
   */
  fees?: AppraisalCsvFees | null;
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
  { fees }: AppraisalCsvOptions = {}
): CsvColumn<AppraisalCsvRow>[] {
  const columns: CsvColumn<AppraisalCsvRow>[] = [
    { header: t('market.appraisal.columnQuantity'), value: (row) => row.quantity },
    { header: t('market.appraisal.columnItem'), value: (row) => row.name },
    { header: t('market.appraisal.columnBuyEach'), value: (row) => row.buyEach },
    { header: t('market.appraisal.columnSellEach'), value: (row) => row.sellEach },
    { header: t('market.appraisal.columnSplitEach'), value: (row) => splitEach(row) },
    { header: t('market.appraisal.columnBuyTotal'), value: (row) => row.buyTotal },
    { header: t('market.appraisal.columnSellTotal'), value: (row) => row.sellTotal },
    // Packaged m³ (issue #2337); unknown exports empty, the same as an unpriced side.
    { header: t('market.appraisal.columnVolume'), value: (row) => row.volume },
    { header: t('market.appraisal.columnIskPerM3'), value: (row) => iskPerM3(row) },
    // Blank where the type has no reprocessing data / no held LP store sells it.
    { header: t('market.appraisal.columnRefineTotal'), value: (row) => row.refineTotal },
    { header: t('market.appraisal.columnLpTotal'), value: (row) => row.lpIskCost },
    { header: t('market.appraisal.columnLpCost'), value: (row) => row.lpCost },
    { header: t('market.appraisal.columnLpCorp'), value: (row) => row.lpCorpName },
    // Blank unless the pilot's assets were subtracted from the list.
    { header: t('market.appraisal.columnNeed'), value: (row) => row.need },
    { header: t('market.appraisal.columnOwned'), value: (row) => row.owned },
    {
      header: t('market.appraisal.columnPriceState'),
      // Only a price that is not live carries a mark on screen.
      value: (row) =>
        row.priceState === 'cached'
          ? t('market.appraisal.live.markCached')
          : row.priceState === 'failed'
            ? t('market.appraisal.live.markFailed')
            : null,
    },
  ];
  if (fees !== undefined) {
    columns.push(
      {
        header: t('market.appraisal.columnSalesTax'),
        value: (row) => (fees === null ? null : sellSalesTax(row, fees.accountingLevel)),
      },
      {
        header: t('market.appraisal.columnBrokerFee'),
        value: (row) =>
          fees === null ? null : sellBrokerFee(row, fees.brokerRelationsLevel, fees.standing),
      },
      {
        header: t('market.appraisal.columnSellAfterFees'),
        value: (row) => (fees === null ? null : sellAfterFees(row, fees)),
      }
    );
  }
  return columns;
}
