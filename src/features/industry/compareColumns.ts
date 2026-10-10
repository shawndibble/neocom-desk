import { createColumnVisibilitySetting } from '@/lib/columnVisibility';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { TRADE_HUBS } from '@/market/hubs';

/**
 * Compare mode's optional columns, in table order. The plan name always shows.
 * Everything past `hubBuyOrders` starts unticked: they answer narrower
 * questions (what the build costs by part, how crowded the hub's book is), and
 * the table already scrolls sideways at 1024px.
 */
export const COMPARE_COLUMN_IDS = [
  'product',
  'runs',
  'duration',
  'materialCost',
  'jobFee',
  'totalCost',
  'revenue',
  'profit',
  'margin',
  'iskPerHour',
  'breakEvenPrice',
  'buyCost',
  'hubBuyOrders',
  'hubSellOrders',
  'hubBuyVolume',
  'hubSellVolume',
] as const;
export type CompareColumnId = (typeof COMPARE_COLUMN_IDS)[number];

export const COMPARE_DEFAULT_COLUMNS: readonly CompareColumnId[] = [
  'product',
  'runs',
  'duration',
  'totalCost',
  'profit',
  'margin',
  'iskPerHour',
  'breakEvenPrice',
  'hubBuyOrders',
];

/** The columns read off the hub's live order book rather than off the plan's own result. */
export const HUB_COLUMN_IDS: readonly CompareColumnId[] = [
  'hubBuyOrders',
  'hubSellOrders',
  'hubBuyVolume',
  'hubSellVolume',
];

export const useVisibleCompareColumns = createColumnVisibilitySetting({
  key: 'buildPlanCompareVisibleColumns',
  ids: COMPARE_COLUMN_IDS,
  defaultVisible: COMPARE_DEFAULT_COLUMNS,
});

/** Which hub the market columns read: each plan's own, or one hub for every row. */
export const PLAN_HUB = 'plan';
export type CompareHubChoice = typeof PLAN_HUB | (typeof TRADE_HUBS)[number]['id'];

export const useCompareHub = createLocalSetting<CompareHubChoice>({
  key: 'buildPlanCompareHub',
  defaultValue: PLAN_HUB,
  parse: (raw) =>
    raw === PLAN_HUB || TRADE_HUBS.some((hub) => hub.id === raw) ? (raw as CompareHubChoice) : null,
});
