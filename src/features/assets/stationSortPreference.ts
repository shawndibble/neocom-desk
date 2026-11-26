import { createLocalSetting } from '@/lib/useLocalSetting';
import type { StationSortField } from '@/engine/assetTree';

export const STATION_SORT_SETTING_KEY = 'assetsStationSort';

export const DEFAULT_STATION_SORT: StationSortField = 'name';

const STATION_SORT_FIELDS: readonly StationSortField[] = [
  'name',
  'value',
  'itemCount',
  'jumpsAway',
];

function isStationSortField(raw: unknown): raw is StationSortField {
  return STATION_SORT_FIELDS.includes(raw as StationSortField);
}

export const useStationSort = createLocalSetting<StationSortField>({
  key: STATION_SORT_SETTING_KEY,
  defaultValue: DEFAULT_STATION_SORT,
  parse: (raw) => (isStationSortField(raw) ? raw : null),
});
