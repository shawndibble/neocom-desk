import { createColumnVisibilitySetting } from '@/lib/columnVisibility';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { TRADE_HUBS } from '@/market/hubs';

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
  'hubOrdersPerDay',
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
  'hubOrdersPerDay',
  'hubBuyOrders',
];

export const HUB_COLUMN_IDS: readonly CompareColumnId[] = [
  'hubOrdersPerDay',
  'hubBuyOrders',
  'hubSellOrders',
  'hubBuyVolume',
  'hubSellVolume',
];

export const HUB_BOOK_COLUMN_IDS: readonly CompareColumnId[] = HUB_COLUMN_IDS.filter(
  (id) => id !== 'hubOrdersPerDay'
);

export const useVisibleCompareColumns = createColumnVisibilitySetting({
  key: 'buildPlanCompareVisibleColumns',
  ids: COMPARE_COLUMN_IDS,
  defaultVisible: COMPARE_DEFAULT_COLUMNS,
});

export const PLAN_HUB = 'plan';
export type CompareHubChoice = typeof PLAN_HUB | (typeof TRADE_HUBS)[number]['id'];

export const useCompareHub = createLocalSetting<CompareHubChoice>({
  key: 'buildPlanCompareHub',
  defaultValue: PLAN_HUB,
  parse: (raw) =>
    raw === PLAN_HUB || TRADE_HUBS.some((hub) => hub.id === raw) ? (raw as CompareHubChoice) : null,
});
