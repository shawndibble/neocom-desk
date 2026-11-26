import { createSyncedSetting } from '@/lib/useSyncedSetting';
import {
  isStoredCharacterFilterValue,
  type StoredCharacterFilterValue,
} from './characterFilterValue';

export const DEFAULT_CHARACTER_FILTER_SETTING_KEY = 'sync.defaultCharacterFilter';

export const useDefaultCharacterFilter = createSyncedSetting<StoredCharacterFilterValue>({
  key: DEFAULT_CHARACTER_FILTER_SETTING_KEY,
  defaultValue: 'current',
  parse: (raw) => (isStoredCharacterFilterValue(raw) ? raw : null),
});
