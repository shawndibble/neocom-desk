/**
 * The Price History day table's optional columns and their device-local
 * visible-columns preference — the `appraisalColumns.ts` pattern. The date is
 * not here: a day list cannot lose the day it lists.
 *
 * `buy` and `sell` are the primary region's open prices; `compared` is every
 * compared region's column(s) (their Buy and Sell, or their average where a
 * region has no open series), one switch rather than up to eight.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/** In table column order. */
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

/** Everything, on a screen wide enough for it. */
export const DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS: readonly PriceHistoryColumnId[] =
  PRICE_HISTORY_COLUMN_IDS;

/**
 * What a phone starts with when nothing is stored: the day's prices and volume
 * (the average only where there are no open buy and sell to stand in for it).
 * Only a default — ticking a column shows it, and a stored selection is read
 * as saved.
 */
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
