import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const LP_VALUE_SETTING_KEY = 'sync.loyaltyLpValue';

export const DEFAULT_LP_VALUE = 0;

export const useLpValue = createSyncedSetting<number>({
  key: LP_VALUE_SETTING_KEY,
  defaultValue: DEFAULT_LP_VALUE,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null),
});
