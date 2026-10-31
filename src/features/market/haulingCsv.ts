import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
import { exportFlag } from '@/lib/exportFlag';
import type { HaulMode } from './haulingData';
import { hubAtAnyEnd, type HaulingAnyEnd } from './haulingHubs';
import type { HaulingViewRow } from './haulingView';

export interface HaulingCsvOptions {
  /** The flag's on-screen label (the panel owns that wording). */
  flagText: (flag: HaulingFlag) => string;
  /** Units the trip plan brings of this row; null when it's off the trip. */
  bringFor: (row: HaulingViewRow) => number | null;
  /** The trip plan's profit on the row's Bring quantity; null when it has no plan line or brings nothing. */
  profitFor: (row: HaulingViewRow) => number | null;
  /** The row's hold space at the Bring quantity, m³; null when it has no plan line. */
  holdM3For: (row: HaulingViewRow) => number | null;
  /** The category a row was added from by the fill, or null for a row the scan itself found. */
  addedFromFor: (row: HaulingViewRow) => string | null;
  /** Whether the row is ticked onto the trip. */
  selectedFor: (row: HaulingViewRow) => boolean;
  /** Selling into buy orders drops Days to Sell and demand, as the table does. Defaults to `list`. */
  mode?: HaulMode;
  /** The end set to Any hub: adds a Hub column naming the hub each row uses there. */
  anyEnd?: HaulingAnyEnd;
}

/**
 * CSV columns for the Hauling table, in its on-screen order, plus the facts it keeps in
 * sub-lines (added-from category) and its tick box. Figures are raw numbers — not the
 * table's "99+" or signed-percent display — and Bring is what the trip plan loads.
 */
export function haulingCsvColumns(
  t: CsvTranslate,
  {
    flagText,
    bringFor,
    profitFor,
    holdM3For,
    addedFromFor,
    selectedFor,
    mode = 'list',
    anyEnd = null,
  }: HaulingCsvOptions
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
  const hub: CsvColumn<HaulingViewRow>[] =
    anyEnd === null
      ? []
      : [
          {
            header: t('market.hauling.columns.hub'),
            value: (row) => hubAtAnyEnd(row, anyEnd).systemName,
          },
        ];
  return [
    { header: t('market.hauling.columns.item'), value: (row) => row.name },
    ...hub,
    { header: t('market.hauling.columns.buy'), value: (row) => row.buyLadder[0]?.price },
    {
      header: t(
        mode === 'instant' ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected'
      ),
      value: (row) => row.price,
    },
    { header: t('market.hauling.columns.profit'), value: profitFor },
    { header: t('market.hauling.columns.margin'), value: (row) => row.marginPct },
    { header: t('market.hauling.columns.iskPerM3'), value: (row) => row.iskPerM3 },
    { header: t('market.hauling.columns.m3'), value: holdM3For },
    ...listing,
    {
      header: t('market.hauling.columns.flags'),
      value: (row) => (row.flags.length ? row.flags.map(flagText).join('; ') : null),
    },
    { header: t('market.hauling.columns.addedFromColumn'), value: addedFromFor },
    { header: t('market.hauling.columns.bring'), value: bringFor },
    {
      header: t('market.hauling.columns.onTripColumn'),
      value: (row) => exportFlag(t, selectedFor(row)),
    },
  ];
}
