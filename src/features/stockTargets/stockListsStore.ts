/**
 * The cross-device store of every **Stock List** (GLOSSARY.md). A synced
 * setting rather than a synced collection — see `sync.stockLists` in
 * `src/sync/syncedSettings.ts` for why. The edits themselves are pure, in
 * `engine/stockTargets/stockLists.ts`.
 */
import { parseStockLists, type StockList } from '@/engine/stockTargets/stockLists';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_STOCK_LISTS_KEY = 'sync.stockLists';

export const useStockLists = createSyncedSetting<StockList[]>({
  key: SYNCED_STOCK_LISTS_KEY,
  defaultValue: [],
  parse: parseStockLists,
});

/** A new list's id. Random, so two devices adding a list never collide. */
export function newStockListId(): string {
  return crypto.randomUUID();
}

/** Which market the Stock tab last opened, per device: "Set stock target" defaults to it. A missing list falls back to the first. */
export const useSelectedStockList = createLocalSetting<string>({
  key: 'stockTargets.selectedList',
  defaultValue: '',
  parse: (raw) => (typeof raw === 'string' ? raw : null),
});
