/**
 * Market Browser order book's optional-column catalog and its device-local
 * visible-columns preference — the `bpcSearchColumns.ts` pattern, applied to
 * the Sell and Buy tables, which share one picker and one stored preference
 * (`Market.tsx`'s `baseColumns` already builds `buyColumns` off the same base).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * In table column order. Sell only ever renders the `baseColumns` prefix
 * (`price` through `jumps`); Buy adds `range` and `minVolume` after `expiry`.
 * Neither table can lose its columns entirely — there is no identity column
 * here to hold back, but every id defaults visible below, so a picker fresh
 * off this release changes nothing until a pilot actually opens it.
 */
export const MARKET_ORDER_COLUMN_IDS = [
  'price',
  'quantity',
  'location',
  'jumps',
  'expiry',
  'range',
  'minVolume',
] as const;

export type MarketOrderColumnId = (typeof MARKET_ORDER_COLUMN_IDS)[number];

/** Every column shown today, so shipping the picker changes nothing on its own. */
export const DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS: readonly MarketOrderColumnId[] =
  MARKET_ORDER_COLUMN_IDS;

function isMarketOrderColumnId(raw: unknown): raw is MarketOrderColumnId {
  return typeof raw === 'string' && (MARKET_ORDER_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_MARKET_ORDER_COLUMNS_KEY = 'marketOrderVisibleColumns';

export const useVisibleMarketOrderColumns = createLocalSetting<readonly MarketOrderColumnId[]>({
  key: VISIBLE_MARKET_ORDER_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS,
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isMarketOrderColumnId)
      ? (raw as MarketOrderColumnId[])
      : null,
});
