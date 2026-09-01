/**
 * Market Browser's Location Mode: Region or Trade Hub (CONTEXT.md round 9),
 * persisted under the plain (non-`sync.`-prefixed) key 'marketLocationMode' —
 * a device-local view preference like `hub.ts`'s Trade Hub setting, never
 * synced.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const LOCATION_MODE_SETTING_KEY = 'marketLocationMode';

export type LocationMode = 'hub' | 'region';

export interface LocationModeValue {
  mode: LocationMode;
  /** Selected Market Region when mode is 'region'; null until the user picks one. */
  regionId: number | null;
}

export const DEFAULT_LOCATION_MODE: LocationModeValue = { mode: 'hub', regionId: null };

function isLocationModeValue(raw: unknown): raw is LocationModeValue {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    (r.mode === 'hub' || r.mode === 'region') &&
    (r.regionId === null || typeof r.regionId === 'number')
  );
}

export const useLocationMode = createLocalSetting<LocationModeValue>({
  key: LOCATION_MODE_SETTING_KEY,
  defaultValue: DEFAULT_LOCATION_MODE,
  parse: (raw) => (isLocationModeValue(raw) ? raw : null),
});
