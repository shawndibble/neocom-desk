/**
 * Whether the unmodified one-key shortcuts in `lib/shortcuts.ts` (`/`, `c`,
 * `,`, `?`) fire at all.
 *
 * WCAG 2.1.4: a shortcut made of a single character key must be possible to
 * turn off. Speech-input users dictating near the shell, and keyboard users
 * with tremors, set them off by accident — a stray "c" swaps the page out
 * from under them.
 *
 * Device-local rather than synced: the need follows the input device (a
 * speech-input laptop, a tremor-friendly keyboard), not the pilot.
 *
 * Default on, which is what the shell did before the switch existed.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const SINGLE_KEY_SHORTCUTS_SETTING_KEY = 'singleKeyShortcuts';

export const DEFAULT_SINGLE_KEY_SHORTCUTS = true;

export const useSingleKeyShortcuts = createLocalSetting<boolean>({
  key: SINGLE_KEY_SHORTCUTS_SETTING_KEY,
  defaultValue: DEFAULT_SINGLE_KEY_SHORTCUTS,
});
