import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { TRADE_HUBS } from '@/market/hubs';
import type { CompareHubRow } from './compareHubsRows';

/**
 * CSV columns for the Trade hubs view: item, then a best sell and a best buy
 * per hub. Raw numbers, empty while loading or without orders, like
 * `compareCsvColumns`.
 */
export function compareHubsCsvColumns(t: CsvTranslate): CsvColumn<CompareHubRow>[] {
  return [
    { header: t('market.compare.columnItem'), value: (row) => row.itemName },
    ...TRADE_HUBS.flatMap((hub): CsvColumn<CompareHubRow>[] => [
      {
        header: t('market.compare.hubSellColumn', { hub: hub.systemName }),
        value: (row) => row.quotes[hub.id].sell,
      },
      {
        header: t('market.compare.hubBuyColumn', { hub: hub.systemName }),
        value: (row) => row.quotes[hub.id].buy,
      },
    ]),
  ];
}
