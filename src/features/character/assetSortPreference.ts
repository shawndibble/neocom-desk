/**
 * Assets page's *item*-list sort field: the one the flat toolbar shows when a
 * search is running or All Items is on. Sibling of `stationSortPreference.ts`,
 * which does the same job for the station list — the two lists sort by
 * different things (an item has a quantity, a station has jumps away), so they
 * are two fields under two keys rather than one shared choice.
 *
 * Device-local view preference, never synced (CONTEXT.md round 7), and
 * deliberately silent: the sort Select is its own control and its own display,
 * so a Settings-page duplicate would be a second place to read the same fact
 * from.
 *
 * Only the sort field is remembered. The minimum-value box beside it and the
 * All Items toggle above it stay per-visit: the first is a filter that hides
 * assets, and reopening the page already filtered — with the reason two
 * controls away — is a page that looks like it lost your things.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ASSET_SORT_SETTING_KEY = 'assetsItemSort';

/** Orders the search/all-items flat list. Name ascending; value and quantity highest-first. */
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
