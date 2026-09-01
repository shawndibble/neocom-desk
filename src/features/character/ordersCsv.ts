import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

/**
 * CSV columns for open orders: item, side, price, remaining volume, total
 * volume, issued. Mirrors the DataTable columns, except the table's single
 * combined "remaining / total" string splits into two numeric columns here —
 * numeric columns export as numbers, not preformatted strings. `issued`
 * passes through as the raw ISO string, not the `toLocaleDateString()`
 * display rendering.
 */
export function ordersCsvColumns(
  t: CsvTranslate,
  nameFor: (typeId: number) => string
): CsvColumn<MarketOrder>[] {
  return [
    { header: t('orders.item'), value: (order) => nameFor(order.type_id) },
    {
      header: t('orders.side'),
      value: (order) => t(order.is_buy_order ? 'orders.buy' : 'orders.sell'),
    },
    { header: t('orders.price'), value: (order) => order.price },
    { header: t('orders.csvVolumeRemain'), value: (order) => order.volume_remain },
    { header: t('orders.csvVolumeTotal'), value: (order) => order.volume_total },
    { header: t('orders.issued'), value: (order) => order.issued },
  ];
}

/** Open-order columns plus `state` (cancelled/expired), for the History tab. */
export function orderHistoryCsvColumns(
  t: CsvTranslate,
  nameFor: (typeId: number) => string
): CsvColumn<MarketOrderHistory>[] {
  return [
    ...ordersCsvColumns(t, nameFor),
    { header: t('orders.state'), value: (order) => order.state },
  ];
}
