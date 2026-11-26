import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { DEFAULT_ITEM_FLAG_MULTIPLE } from '@/engine/contracts/contractFlags';

export const ITEM_FLAG_MULTIPLE_SETTING_KEY = 'sync.itemContractFlagMultiple';

export const ITEM_FLAG_MULTIPLE_OPTIONS: readonly number[] = [5, 10, 20, 50];

export const useItemFlagMultiple = createSyncedSetting<number>({
  key: ITEM_FLAG_MULTIPLE_SETTING_KEY,
  defaultValue: DEFAULT_ITEM_FLAG_MULTIPLE,
  parse: (raw) =>
    typeof raw === 'number' && ITEM_FLAG_MULTIPLE_OPTIONS.includes(raw) ? raw : null,
});
