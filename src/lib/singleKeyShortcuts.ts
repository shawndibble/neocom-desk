import { createLocalSetting } from '@/lib/useLocalSetting';

export const SINGLE_KEY_SHORTCUTS_SETTING_KEY = 'singleKeyShortcuts';
const DEFAULT_SINGLE_KEY_SHORTCUTS = true;

export const useSingleKeyShortcuts = createLocalSetting<boolean>({
  key: SINGLE_KEY_SHORTCUTS_SETTING_KEY,
  defaultValue: DEFAULT_SINGLE_KEY_SHORTCUTS,
});
