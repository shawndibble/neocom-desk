/**
 * The Corp assets ledger's optional columns and their device-local
 * visible-columns preferences. The Item column (by item) and the place column
 * (by location) name the rows, so neither is optional.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CORP_ASSET_ITEM_COLUMN_IDS = [
  'quantity',
  'target',
  'shortBy',
  'where',
  'value',
  'volume',
  'group',
] as const;
export type CorpAssetItemColumnId = (typeof CORP_ASSET_ITEM_COLUMN_IDS)[number];

/** Volume and Group start off: they are lookups, not the stock question this page answers. */
export const CORP_ASSET_ITEM_DEFAULT_COLUMNS: readonly CorpAssetItemColumnId[] = [
  'quantity',
  'target',
  'shortBy',
  'where',
  'value',
];

export const useVisibleCorpAssetItemColumns = createColumnVisibilitySetting({
  key: 'corpAssetsItemVisibleColumns',
  ids: CORP_ASSET_ITEM_COLUMN_IDS,
  defaultVisible: CORP_ASSET_ITEM_DEFAULT_COLUMNS,
});

export const CORP_ASSET_LOCATION_COLUMN_IDS = ['items', 'largest', 'value', 'volume'] as const;
export type CorpAssetLocationColumnId = (typeof CORP_ASSET_LOCATION_COLUMN_IDS)[number];

export const useVisibleCorpAssetLocationColumns = createColumnVisibilitySetting({
  key: 'corpAssetsLocationVisibleColumns',
  ids: CORP_ASSET_LOCATION_COLUMN_IDS,
});
