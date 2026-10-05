/**
 * Market Browser order book's optional-column catalog and its device-local
 * visible-columns preference — the `bpcSearchColumns.ts` pattern, applied to
 * the Sell and Buy tables, which share one picker and one stored preference
 * (`Market.tsx`'s `baseColumns` already builds `buyColumns` off the same base).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * In table column order. Sell only ever renders the `baseColumns` prefix
 * (`price` through `expiry`); Buy adds `range` and `minVolume` after `expiry`.
 * Neither table can lose its columns entirely — there is no identity column
 * here to hold back. Every id but `minVolume` defaults visible below.
 */
export const MARKET_ORDER_COLUMN_IDS = [
  'price',
  'quantity',
  'jumps',
  'location',
  'security',
  'expiry',
  'range',
  'minVolume',
] as const;

export type MarketOrderColumnId = (typeof MARKET_ORDER_COLUMN_IDS)[number];

/** Sell has no `range`/`minVolume` — buy-order-only fields (ESI's `RegionOrder`). */
export const SELL_ORDER_COLUMN_IDS: readonly MarketOrderColumnId[] = [
  'price',
  'quantity',
  'jumps',
  'location',
  'security',
  'expiry',
];
export const BUY_ORDER_COLUMN_IDS: readonly MarketOrderColumnId[] = MARKET_ORDER_COLUMN_IDS;

/**
 * Every column but Min. Volume, which is almost always 1 (the expanded row
 * states it for every buy order) and would cost the book 8rem of width
 * before its rows become cards. A pilot who wants it ticks it.
 */
export const DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS: readonly MarketOrderColumnId[] =
  MARKET_ORDER_COLUMN_IDS.filter((id) => id !== 'minVolume');

function isMarketOrderColumnId(raw: unknown): raw is MarketOrderColumnId {
  return typeof raw === 'string' && (MARKET_ORDER_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_MARKET_ORDER_COLUMNS_KEY = 'marketOrderVisibleColumns';

export const useVisibleMarketOrderColumns = createLocalSetting<readonly MarketOrderColumnId[]>({
  key: VISIBLE_MARKET_ORDER_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS,
  // Unknown ids are dropped rather than voiding the whole preference: a
  // retired column (Cum. qty's `depth`) shouldn't reset a pilot's picks.
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    const known = raw.filter(isMarketOrderColumnId);
    return known.length > 0 ? known : null;
  },
});

/**
 * Location's width cap in a table row: `roomy` while the book has room, then
 * `squeezed` (still truncated, the full name in the tooltip and expanded row)
 * before the rows give up and become cards.
 */
export const ORDER_BOOK_LOCATION_REM = { roomy: 16, squeezed: 9 } as const;

/**
 * What each column needs in a table row, in rem, measured in Chrome: mostly
 * the header (its `px-3` and sort icon) rather than the value, except Price,
 * sized for a twelve-digit ISK figure. Location is `ORDER_BOOK_LOCATION_REM`.
 */
const ORDER_BOOK_COLUMN_REM: Record<Exclude<MarketOrderColumnId, 'location'>, number> = {
  price: 6.5,
  quantity: 6.5,
  jumps: 5.25,
  security: 6.25,
  expiry: 5.75,
  range: 5.25,
  minVolume: 8,
};

/** The row's expand toggle (`expandableRow`), plus the card's border. */
const ORDER_BOOK_FIXED_REM = 2.5 + 0.25;

/**
 * The order book widths its Sell and Buy tables need for the picked columns
 * (Buy's, the wider set — Sell's are a subset): below `roomy` Location's cap
 * shrinks to `squeezed`, below `cards` the rows become cards. Following the
 * picker means a pilot who hides columns keeps the table at a narrower width.
 */
export function orderBookWidthsRem(visible: readonly MarketOrderColumnId[]): {
  roomy: number;
  cards: number;
} {
  let rest = ORDER_BOOK_FIXED_REM;
  for (const id of visible) if (id !== 'location') rest += ORDER_BOOK_COLUMN_REM[id];
  if (!visible.includes('location')) return { roomy: rest, cards: rest };
  return {
    roomy: rest + ORDER_BOOK_LOCATION_REM.roomy,
    cards: rest + ORDER_BOOK_LOCATION_REM.squeezed,
  };
}
