import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
import type { HaulMode } from './haulingData';
import type { HaulingViewRow } from './haulingView';

export interface HaulingCsvOptions {
  /** The flag's on-screen label (the panel owns that wording). */
  flagText: (flag: HaulingFlag) => string;
  /** Units the trip plan brings of this row; null when it's off the trip. */
  bringFor: (row: HaulingViewRow) => number | null;
  /** Selling into buy orders drops Days to Sell and demand, as the table does. Defaults to `list`. */
  mode?: HaulMode;
}

/**
 * CSV columns for the Hauling table, in its on-screen order. Prices, margin
 * (percent), ISK/m³ and days to sell are raw numbers — not the table's "99+"
 * or signed-percent display — and the Bring column is what the current trip
 * plan loads, overrides included.
 */
export function haulingCsvColumns(
  t: CsvTranslate,
  { flagText, bringFor, mode = 'list' }: HaulingCsvOptions
): CsvColumn<HaulingViewRow>[] {
  const listing: CsvColumn<HaulingViewRow>[] =
    mode === 'list'
      ? [
          {
            header: t('market.hauling.columns.days'),
            value: (row) => (row.mode === 'list' ? row.sale.daysToSell : null),
          },
          {
            header: t('market.hauling.columns.demand'),
            value: (row) =>
              row.mode === 'list' ? t(`market.hauling.demand.${row.demand.demand}`) : null,
          },
        ]
      : [];
  return [
    { header: t('market.hauling.columns.item'), value: (row) => row.name },
    { header: t('market.hauling.columns.buy'), value: (row) => row.buyLadder[0]?.price },
    {
      header: t(
        mode === 'instant' ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected'
      ),
      value: (row) => row.price,
    },
    { header: t('market.hauling.columns.margin'), value: (row) => row.marginPct },
    { header: t('market.hauling.columns.iskPerM3'), value: (row) => row.iskPerM3 },
    ...listing,
    {
      header: t('market.hauling.columns.flags'),
      value: (row) => (row.flags.length ? row.flags.map(flagText).join('; ') : null),
    },
    { header: t('market.hauling.columns.bring'), value: bringFor },
  ];
}
