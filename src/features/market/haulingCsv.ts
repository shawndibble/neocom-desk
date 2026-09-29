import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
import type { HaulingViewRow } from './haulingView';

export interface HaulingCsvOptions {
  /** The flag's on-screen label (the panel owns that wording). */
  flagText: (flag: HaulingFlag) => string;
  /** Units the trip plan brings of this row; null when it's off the trip. */
  bringFor: (row: HaulingViewRow) => number | null;
}

/**
 * CSV columns for the Hauling table, in its on-screen order. Prices, margin
 * (percent) and days to sell are raw numbers — not the table's "99+" or
 * signed-percent display — and the Bring column is what the current trip
 * plan loads, overrides included.
 */
export function haulingCsvColumns(
  t: CsvTranslate,
  { flagText, bringFor }: HaulingCsvOptions
): CsvColumn<HaulingViewRow>[] {
  return [
    { header: t('market.hauling.columns.item'), value: (row) => row.name },
    { header: t('market.hauling.columns.buy'), value: (row) => row.buyLadder[0]?.price },
    { header: t('market.hauling.columns.expected'), value: (row) => row.sale.price },
    { header: t('market.hauling.columns.margin'), value: (row) => row.marginPct },
    { header: t('market.hauling.columns.days'), value: (row) => row.sale.daysToSell },
    {
      header: t('market.hauling.columns.demand'),
      value: (row) => t(`market.hauling.demand.${row.demand.demand}`),
    },
    {
      header: t('market.hauling.columns.flags'),
      value: (row) => (row.flags.length ? row.flags.map(flagText).join('; ') : null),
    },
    { header: t('market.hauling.columns.bring'), value: bringFor },
  ];
}
