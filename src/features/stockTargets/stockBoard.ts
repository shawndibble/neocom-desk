import { rankMarkets } from '@/engine/stockTargets/markets';
import { buildStockRows, summarizeStock, type StockSummary } from '@/engine/stockTargets/stockRows';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { loadHubFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { useStockLists } from './stockListsStore';
import { loadStockAlertEntries } from './stockTargetsData';

export interface StockBoardMarket {
  listId: string;
  name: string;
  summary: StockSummary;
}

export interface StockBoardData {
  markets: StockBoardMarket[];
  totals: { out: number; low: number };
  counted: boolean;
}

export async function loadStockBoard(): Promise<StockBoardData | null> {
  const [, hubId] = await Promise.all([useStockLists.getState().hydrate(), loadHubFor('market')]);
  const lists = useStockLists.getState().value;
  if (lists.length === 0) return null;
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const typeIds = [...new Set(lists.flatMap((list) => list.items.map((item) => item.typeId)))];
  const [entries, prices] = await Promise.all([
    loadStockAlertEntries(lists),
    getHubPrices(hub, typeIds).catch(() => new Map<number, { sellMin: number | null }>()),
  ]);
  const counted = entries.every((entry) => entry.listed !== null);
  const markets = lists.map((list) => {
    const rows = counted
      ? buildStockRows(
          entries
            .filter((entry) => entry.listId === list.id)
            .map((entry) => ({
              typeId: entry.typeId,
              target: entry.target,
              listed: entry.listed ?? 0,
              inHangar: entry.inHangar,
              inJobs: entry.inJobs,
              price: prices.get(entry.typeId)?.sellMin ?? null,
            }))
        )
      : [];
    return { listId: list.id, name: list.name, summary: summarizeStock(rows) };
  });
  const ranked = rankMarkets(markets.map((market) => ({ ...market, ...market.summary }))).map(
    ({ listId, name, summary }) => ({ listId, name, summary })
  );
  return {
    markets: ranked,
    totals: {
      out: markets.reduce((sum, market) => sum + market.summary.out, 0),
      low: markets.reduce((sum, market) => sum + market.summary.low, 0),
    },
    counted,
  };
}

export function stockBoardSeverity(data: StockBoardData | null): DeadlineSeverity | null {
  if (data === null || !data.counted) return null;
  return data.totals.out > 0 || data.totals.low > 0 ? 'warning' : 'clear';
}
