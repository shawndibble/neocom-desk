import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  iskPerM3,
  type AppraisalNetFees,
  type AppraisalRow,
  type RefineBasis,
} from '@/engine/market/appraisal';
import { basisFreeFigures, rowFigures } from '@/engine/market/appraisalRowFigures';
import type { OwnedRow } from '@/engine/market/appraisalOwned';
import { priceMarkKey } from './priceStateLabel';

interface AppraisalCsvOptions {
  fees?: AppraisalNetFees | null;
  live?: { refineBasis: RefineBasis };
}

export function appraisalCsvColumns(
  t: CsvTranslate,
  { fees, live }: AppraisalCsvOptions = {}
): CsvColumn<OwnedRow>[] {
  const columns: CsvColumn<OwnedRow>[] = [
    { header: t('market.appraisal.columnQuantity'), value: (row) => row.quantity },
    { header: t('market.appraisal.columnItem'), value: (row) => row.name },
    { header: t('market.appraisal.columnBuyEach'), value: (row) => row.buyEach },
    { header: t('market.appraisal.columnSellEach'), value: (row) => row.sellEach },
    {
      header: t('market.appraisal.columnSplitEach'),
      value: (row) => basisFreeFigures(row, null).splitEach,
    },
    { header: t('market.appraisal.columnBuyTotal'), value: (row) => row.buyTotal },
    { header: t('market.appraisal.columnSellTotal'), value: (row) => row.sellTotal },
    { header: t('market.appraisal.columnVolume'), value: (row) => row.volume },
    { header: t('market.appraisal.columnIskPerM3'), value: (row) => iskPerM3(row) },
  ];
  if (live !== undefined) {
    const refineOf = (row: AppraisalRow) => rowFigures(row, live.refineBasis, null).refine;
    columns.push(
      {
        header: t('market.appraisal.columnRefineTotal'),
        value: (row) => refineOf(row).minerals,
      },
      {
        header: t('market.appraisal.columnRefineWithLeftover'),
        value: (row) => refineOf(row).withLeftover,
      },
      { header: t('market.appraisal.columnLpTotal'), value: (row) => row.lpIskCost },
      { header: t('market.appraisal.columnLpCost'), value: (row) => row.lpCost },
      { header: t('market.appraisal.columnLpCorp'), value: (row) => row.lpCorpName },
      { header: t('market.appraisal.columnNeed'), value: (row) => row.need },
      { header: t('market.appraisal.columnOwned'), value: (row) => row.owned },
      {
        header: t('market.appraisal.columnPriceState'),
        value: (row) => {
          const key = priceMarkKey(row.priceState);
          return key === null ? null : t(key);
        },
      }
    );
  }
  if (fees !== undefined) {
    const feesOf = (row: AppraisalRow) => basisFreeFigures(row, fees).fees;
    columns.push(
      {
        header: t('market.appraisal.columnSalesTax'),
        value: (row) => feesOf(row).salesTax,
      },
      {
        header: t('market.appraisal.columnBrokerFee'),
        value: (row) => feesOf(row).brokerFee,
      },
      {
        header: t('market.appraisal.columnSellAfterFees'),
        value: (row) => feesOf(row).afterFees,
      }
    );
  }
  return columns;
}
