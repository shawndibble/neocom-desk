import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ASSUMED_TE_SETTING_KEY = 'sync.industryAssumedTe';

export const MIN_ASSUMED_TE = 0;
export const MAX_ASSUMED_TE = 20;
export const DEFAULT_ASSUMED_TE = 0;

export const useAssumedTe = createSyncedSetting<number>({
  key: ASSUMED_TE_SETTING_KEY,
  defaultValue: DEFAULT_ASSUMED_TE,
  parse: (raw) =>
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= MIN_ASSUMED_TE &&
    raw <= MAX_ASSUMED_TE
      ? raw
      : null,
});
