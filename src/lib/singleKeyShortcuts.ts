import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * Device-local off switch for the global keyboard shortcuts that are plain
 * characters (the `g` sequences and `?`), the way WCAG 2.1.4 asks. Esc and
 * Ctrl/Cmd+K are not affected.
 */
export const SINGLE_KEY_SHORTCUTS_SETTING_KEY = 'singleKeyShortcuts';
const DEFAULT_SINGLE_KEY_SHORTCUTS = true;

export const useSingleKeyShortcuts = createLocalSetting<boolean>({
  key: SINGLE_KEY_SHORTCUTS_SETTING_KEY,
  defaultValue: DEFAULT_SINGLE_KEY_SHORTCUTS,
});
