import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
import { exportFlag } from '@/lib/exportFlag';
import type { HaulMode } from './haulingData';
import { hubAtAnyEnd, type HaulingAnyEnd } from './haulingHubs';
import type { HaulingViewRow } from './haulingView';

export interface HaulingCsvOptions {
  flagText: (flag: HaulingFlag) => string;
  bringFor: (row: HaulingViewRow) => number | null;
  profitFor: (row: HaulingViewRow) => number | null;
  holdM3For: (row: HaulingViewRow) => number | null;
  addedFromFor: (row: HaulingViewRow) => string | null;
  selectedFor: (row: HaulingViewRow) => boolean;
  mode?: HaulMode;
  anyEnd?: HaulingAnyEnd;
}

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
