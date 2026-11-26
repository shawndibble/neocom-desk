import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ASSUMED_ME_SETTING_KEY = 'sync.industryAssumedMe';

export const LEGACY_ASSUMED_ME_SETTING_KEY = 'industryAssumedMe';

export const MIN_ASSUMED_ME = 0;
export const MAX_ASSUMED_ME = 10;
export const DEFAULT_ASSUMED_ME = 0;

export const useAssumedMe = createSyncedSetting<number>({
  key: ASSUMED_ME_SETTING_KEY,
  legacyKey: LEGACY_ASSUMED_ME_SETTING_KEY,
  defaultValue: DEFAULT_ASSUMED_ME,
  parse: (raw) =>
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= MIN_ASSUMED_ME &&
    raw <= MAX_ASSUMED_ME
      ? raw
      : null,
});
