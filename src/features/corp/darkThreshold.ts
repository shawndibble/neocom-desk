import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { DARK_AFTER_DAYS } from '@/engine/corp/members';

export const DARK_THRESHOLD_SETTING_KEY = 'sync.corpDarkAfterDays';

export const LEGACY_DARK_THRESHOLD_SETTING_KEY = 'corpDarkAfterDays';

export const DARK_AFTER_DAY_OPTIONS: readonly number[] = [14, 30, 60, 90];

export const useDarkThreshold = createSyncedSetting<number>({
  key: DARK_THRESHOLD_SETTING_KEY,
  legacyKey: LEGACY_DARK_THRESHOLD_SETTING_KEY,
  defaultValue: DARK_AFTER_DAYS,
  parse: (raw) => (typeof raw === 'number' && DARK_AFTER_DAY_OPTIONS.includes(raw) ? raw : null),
});
