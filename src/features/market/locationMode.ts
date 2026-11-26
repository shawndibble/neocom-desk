import { ALL_REGIONS, type RegionChoice } from '@/engine/market/locationMode';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const LOCATION_MODE_SETTING_KEY = 'marketLocationMode';

export type LocationMode = 'hub' | 'region';

export interface LocationModeValue {
  mode: LocationMode;
  regionId: RegionChoice | null;
}

export const DEFAULT_LOCATION_MODE: LocationModeValue = { mode: 'hub', regionId: null };

function isLocationModeValue(raw: unknown): raw is LocationModeValue {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    (r.mode === 'hub' || r.mode === 'region') &&
    (r.regionId === null || r.regionId === ALL_REGIONS || typeof r.regionId === 'number')
  );
}

export const useLocationMode = createLocalSetting<LocationModeValue>({
  key: LOCATION_MODE_SETTING_KEY,
  defaultValue: DEFAULT_LOCATION_MODE,
  parse: (raw) => (isLocationModeValue(raw) ? raw : null),
});
