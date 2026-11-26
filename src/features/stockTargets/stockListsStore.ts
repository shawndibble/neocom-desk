import { parseStockLists, type StockList } from '@/engine/stockTargets/stockLists';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_STOCK_LISTS_KEY = 'sync.stockLists';

export const useStockLists = createSyncedSetting<StockList[]>({
  key: SYNCED_STOCK_LISTS_KEY,
  defaultValue: [],
  parse: parseStockLists,
});

export function newStockListId(): string {
  return crypto.randomUUID();
}

export const useSelectedStockList = createLocalSetting<string>({
  key: 'stockTargets.selectedList',
  defaultValue: '',
  parse: (raw) => (typeof raw === 'string' ? raw : null),
});
