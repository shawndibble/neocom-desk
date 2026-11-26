import { createLocalSetting } from '@/lib/useLocalSetting';

export const PRICE_HISTORY_COLUMN_IDS = [
  'average',
  'buy',
  'sell',
  'range',
  'volume',
  'orderCount',
  'compared',
] as const;

export type PriceHistoryColumnId = (typeof PRICE_HISTORY_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS: readonly PriceHistoryColumnId[] =
  PRICE_HISTORY_COLUMN_IDS;

export function leanPriceHistoryColumns(hasOpen: boolean): readonly PriceHistoryColumnId[] {
  return hasOpen ? ['buy', 'sell', 'volume'] : ['average', 'volume'];
}

function isColumnId(raw: unknown): raw is PriceHistoryColumnId {
  return typeof raw === 'string' && (PRICE_HISTORY_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_PRICE_HISTORY_COLUMNS_KEY = 'marketPriceHistoryColumns';

export const useVisiblePriceHistoryColumns = createLocalSetting<readonly PriceHistoryColumnId[]>({
  key: VISIBLE_PRICE_HISTORY_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
  parse: (raw) =>
    Array.isArray(raw) && raw.every(isColumnId) ? (raw as PriceHistoryColumnId[]) : null,
});
