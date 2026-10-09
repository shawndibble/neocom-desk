import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

/**
 * The optional columns, in table order. Product, ISK/hour, ISK/day and the
 * PLAN button always show. Blueprint source, Time and Depth start unticked: at
 * 1024px the table otherwise scrolls sideways and pushes PLAN, the row's main
 * action, off-screen. A source worth knowing (anything but the NPC market)
 * still shows as a dim note beside the product while its column is off.
 */
export const MARKET_WIDE_COLUMN_IDS = [
  'blueprintSource',
  'margin',
  'duration',
  'buildCost',
  'orderDepth',
] as const;
export type MarketWideColumnId = (typeof MARKET_WIDE_COLUMN_IDS)[number];
export const MARKET_WIDE_DEFAULT_COLUMNS: readonly MarketWideColumnId[] = ['margin', 'buildCost'];
export const useVisibleMarketWideColumns = createColumnVisibilitySetting({
  key: 'marketWideVisibleColumns',
  ids: MARKET_WIDE_COLUMN_IDS,
  defaultVisible: MARKET_WIDE_DEFAULT_COLUMNS,
});
