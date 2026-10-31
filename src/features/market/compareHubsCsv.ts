import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { TRADE_HUBS } from '@/market/hubs';
import type { CompareHubRow } from './compareHubsRows';
import type { HubId } from './useCompareHubs';

/**
 * CSV columns for the Trade hubs view: item, then per hub its best sell, best
 * buy, jumps from the pilot and a status that tells "Unreachable" (the read
 * failed) from "No sellers"/"No buyers"/"No orders" (it answered, nobody is
 * trading); then which hub has the lowest sell and highest buy, and the
 * pilot's own market hub. Raw numbers, empty while loading or without orders,
 * like `compareCsvColumns`.
 */
export function compareHubsCsvColumns(
  t: CsvTranslate,
  context: {
    jumps: Readonly<Record<HubId, number | null>>;
    ownHub: HubId;
  }
): CsvColumn<CompareHubRow>[] {
  const hubName = (id: HubId | null) =>
    id === null ? null : (TRADE_HUBS.find((hub) => hub.id === id)?.systemName ?? null);
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
          if (quote.sell === null) return t('market.compare.noSellers');
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
