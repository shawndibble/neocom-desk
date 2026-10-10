/**
 * The Overview's Stock card: the pilot's last-viewed **Stock List**, worst
 * first, counted from cached assets and orders like the below-target alert —
 * the landing page never fans out a live asset read.
 */
import {
  buildStockRows,
  summarizeStock,
  type StockRow,
  type StockSummary,
} from '@/engine/stockTargets/stockRows';
import type { DeadlineSeverity } from '@/engine/severity';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { loadStockAlertEntries } from './stockTargetsData';

export interface StockBoardData {
  listName: string;
  rows: StockRow[];
  names: Map<number, string>;
  summary: StockSummary;
  /** False before any asset list is cached: the counts are then unknown, not zero. */
  counted: boolean;
}

/** Null when the pilot has no Stock List, which is also what keeps the card off the board. */
export async function loadStockBoard(): Promise<StockBoardData | null> {
  await Promise.all([
    useStockLists.getState().hydrate(),
    useSelectedStockList.getState().hydrate(),
    useMarketHub.getState().hydrate(),
  ]);
  const lists = useStockLists.getState().value;
  const selectedId = useSelectedStockList.getState().value;
  const list = lists.find((l) => l.id === selectedId) ?? lists[0];
  if (!list) return null;
  const hub = getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
  const typeIds = list.items.map((item) => item.typeId);
  const [entries, prices] = await Promise.all([
    loadStockAlertEntries([list]),
    getHubPrices(hub, typeIds).catch(() => new Map<number, { sellMin: number | null }>()),
  ]);
  const counted = entries.every((entry) => entry.onHand !== null);
  const rows = counted
    ? buildStockRows(
        entries.map((entry) => ({
          typeId: entry.typeId,
          target: entry.target,
          onHand: entry.onHand ?? 0,
          price: prices.get(entry.typeId)?.sellMin ?? null,
        }))
      )
    : [];
  return {
    listName: list.name,
    rows,
    names: new Map(entries.map((entry) => [entry.typeId, entry.name])),
    summary: summarizeStock(rows),
    counted,
  };
}

export function stockBoardSeverity(data: StockBoardData | null): DeadlineSeverity | null {
  if (data === null || !data.counted) return null;
  return data.summary.out > 0 || data.summary.low > 0 ? 'warning' : 'clear';
}
