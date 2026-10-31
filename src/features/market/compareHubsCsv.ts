import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { getTradeHub, TRADE_HUBS } from '@/market/hubs';
import type { CompareHubRow } from './compareHubsRows';
import type { HubId } from './useCompareHubs';

/**
 * CSV columns for the Trade hubs view. Per hub a status tells "Unreachable" (the read failed)
 * from "No sellers" (it answered, nobody is trading). Raw numbers, empty while loading.
 */
export function compareHubsCsvColumns(
  t: CsvTranslate,
  context: {
    jumps: Readonly<Record<HubId, number | null>>;
    ownHub: HubId;
  }
): CsvColumn<CompareHubRow>[] {
  const hubName = (id: HubId | null) =>
    id === null ? null : (getTradeHub(id)?.systemName ?? null);
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
      {
        header: t('market.compare.hubJumpsColumn', { hub: hub.systemName }),
        value: () => context.jumps[hub.id],
      },
      {
        header: t('market.compare.hubStatusColumn', { hub: hub.systemName }),
        value: (row) => {
          const quote = row.quotes[hub.id];
          if (quote.loading) return null;
          if (row.unreachable[hub.id]) return t('market.compare.exportUnreachable');
          if (quote.sell === null && quote.buy === null) return t('market.compare.exportNoOrders');
          if (quote.sell === null) return t('market.compare.exportNoSellers');
          if (quote.buy === null) return t('market.compare.exportNoBuyers');
          return null;
        },
      },
    ]),
    { header: t('market.compare.columnBestSellHub'), value: (row) => hubName(row.bestSellHub) },
    { header: t('market.compare.columnBestBuyHub'), value: (row) => hubName(row.bestBuyHub) },
    { header: t('market.compare.columnYourHub'), value: () => hubName(context.ownHub) },
  ];
}
