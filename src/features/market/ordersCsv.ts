import { isoTime } from '@/lib/exportSheets';
import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OpenOrderRow } from './openOrdersModel';
import { orderDoThisText, rowFixCall } from './orderDoThis';
import { shownFloorPrice } from './orderRowFormat';

/**
 * CSV columns for the Open Orders fix list, one row per `OpenOrderRow`: raw figures, `issued`
 * as the ESI ISO string, floor as shown (rounded up), station cheapest blank unless a rival beats the order.
 */
export function ordersCsvColumns(t: CsvTranslate): CsvColumn<OpenOrderRow>[] {
  return [
    { header: t('orders.item'), value: (row) => row.typeName },
    {
      header: t('orders.side'),
      value: (row) => t(row.isBuyOrder ? 'orders.buy' : 'orders.sell'),
    },
    { header: t('orders.csvStation'), value: (row) => row.stationName },
    { header: t('orders.csvCharacter'), value: (row) => row.characterName },
    { header: t('orders.price'), value: (row) => row.price },
    { header: t('orders.csvVolumeRemain'), value: (row) => row.volumeRemain },
    { header: t('orders.csvVolumeTotal'), value: (row) => row.volumeTotal },
    { header: t('orders.issued'), value: (row) => row.issued },
    {
      header: t('orders.expires'),
      value: (row) => isoTime(row.expiry?.expiresAt),
    },
    { header: t('orders.csvDaysLeft'), value: (row) => row.expiry?.daysLeft ?? null },
    {
      header: t('market.orders.floorLabel'),
      value: (row) => (row.floor ? shownFloorPrice(row.floor) : null),
    },
    {
      header: t('market.orders.fixList.colStationCheapest'),
      value: (row) => (row.station.beatsMe ? row.station.bestPrice : null),
    },
    { header: t('market.orders.fixList.colIskTiedUp'), value: (row) => row.iskTiedUp },
    {
      header: t('market.orders.fixList.colProblem'),
      value: (row) => {
        const { badge } = rowFixCall(row).advice;
        if (!badge) return null;
        const label = t(`market.orders.badge.${badge.kind}`);
        return badge.detail ? `${label} ${badge.detail}` : label;
      },
    },
    { header: t('market.orders.fixList.colDoThis'), value: (row) => orderDoThisText(t, row) },
  ];
}
