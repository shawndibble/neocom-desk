import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MINING_TAX_ORE_VALUE_MODE_KEY = 'sync.miningTaxOreValueMode';

export const useMiningTaxOreValueMode = createSyncedSetting<boolean>({
  key: MINING_TAX_ORE_VALUE_MODE_KEY,
  defaultValue: false,
});
