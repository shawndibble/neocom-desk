import { markBestHubs, type HubQuoteState } from '@/engine/market/compareHubs';
import { TRADE_HUBS } from '@/market/hubs';
import type { CompareSetItem } from './compareSet';
import type { HubId, UseCompareHubsResult } from './useCompareHubs';

export interface CompareHubRow extends CompareSetItem {
  quotes: Readonly<Record<HubId, HubQuoteState>>;
  /** A hub whose price read failed: its cells show "—", not "No sellers". */
  unreachable: Readonly<Record<HubId, boolean>>;
  bestSellHub: HubId | null;
  bestBuyHub: HubId | null;
}

const HUB_ORDER = TRADE_HUBS.map((hub) => hub.id);

/** One row per Compare Set item, each hub's best sell/buy and the row's best marks. */
export function buildCompareHubRows(
  items: readonly CompareSetItem[],
  { hubs }: Pick<UseCompareHubsResult, 'hubs'>
): CompareHubRow[] {
  return items.map((item) => {
    const quotes = {} as Record<HubId, HubQuoteState>;
    const unreachable = {} as Record<HubId, boolean>;
    for (const id of HUB_ORDER) {
      const hub = hubs[id];
      const aggregate = hub.prices.get(item.typeId);
      quotes[id] = {
        sell: aggregate?.sellMin ?? null,
        buy: aggregate?.buyMax ?? null,
        loading: hub.loading,
      };
      unreachable[id] = hub.unreachable && !aggregate;
    }
    return { ...item, quotes, unreachable, ...markBestHubs(quotes, HUB_ORDER) };
  });
}
