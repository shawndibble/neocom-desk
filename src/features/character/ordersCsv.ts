import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { roundPriceUp } from '@/engine/market/priceTick';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { orderDoThisText, rowFixCall } from '@/features/market/orderDoThis';

/**
 * CSV columns for the Open Orders fix list, one row per `OpenOrderRow`: item,
 * side, price, remaining and total volume (two numeric columns, not the
 * table's "N / M" string), issued, and every fact the fix list shows or keeps
 * in its sub-line and detail: station, owning character, expiry and days
 * left, floor, station cheapest, ISK tied up, what is wrong and what to do.
 * Raw figures; `issued` as the ESI ISO string. Floor is the price as shown
 * (rounded up to a legal price). Station cheapest is blank unless a rival
 * beats the order, as on screen.
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
      value: (row) => (row.expiry ? new Date(row.expiry.expiresAt).toISOString() : null),
    },
    { header: t('orders.csvDaysLeft'), value: (row) => row.expiry?.daysLeft ?? null },
    {
      header: t('orders.csvFloor'),
      value: (row) => (row.floor ? (roundPriceUp(row.floor.relist) ?? row.floor.relist) : null),
    },
    {
      header: t('orders.csvStationCheapest'),
      value: (row) => (row.station.beatsMe ? row.station.bestPrice : null),
    },
    { header: t('orders.csvIskTiedUp'), value: (row) => row.iskTiedUp },
    {
      header: t('orders.csvProblem'),
      value: (row) => {
        const { badge } = rowFixCall(row).advice;
        if (!badge) return null;
        const label = t(`market.orders.badge.${badge.kind}`);
        return badge.detail ? `${label} ${badge.detail}` : label;
      },
    },
    { header: t('orders.csvDoThis'), value: (row) => orderDoThisText(t, row) },
  ];
}
