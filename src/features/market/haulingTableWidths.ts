/**
 * Table widths (rem), measured in Chrome: below `compact` figures go compact
 * (full columns ~35.8rem + ~9rem for a two-line Item), below `cards` rows
 * become cards: compact columns ~34.3rem plus `HAULING_ITEM_MIN_REM` for the
 * Item name, so a long name wraps to about two lines, never four. Hub adds
 * ~5.3rem.
 */
export const HAULING_COMPACT_COLUMNS_REM = 34.3;
export const HAULING_ITEM_MIN_REM = 11;
export const HAULING_HUB_COLUMN_REM = 5.3;
export const TABLE_WIDTHS = {
  oneHub: { compact: 45, cards: 46 },
  anyHub: { compact: 50.5, cards: 51.5 },
} as const;
