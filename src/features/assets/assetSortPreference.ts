import { createLocalSetting } from '@/lib/useLocalSetting';

export const ASSET_SORT_SETTING_KEY = 'assetsItemSort';

export type AssetSortField = 'name' | 'value' | 'quantity';

export const DEFAULT_ASSET_SORT: AssetSortField = 'name';

const ASSET_SORT_FIELDS: readonly AssetSortField[] = ['name', 'value', 'quantity'];

function isAssetSortField(raw: unknown): raw is AssetSortField {
  return ASSET_SORT_FIELDS.includes(raw as AssetSortField);
}

export const useAssetSort = createLocalSetting<AssetSortField>({
  key: ASSET_SORT_SETTING_KEY,
  defaultValue: DEFAULT_ASSET_SORT,
  parse: (raw) => (isAssetSortField(raw) ? raw : null),
});
