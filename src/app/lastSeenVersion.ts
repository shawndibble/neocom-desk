/**
 * Last app version the current device has seen the "what's new" panel for,
 * persisted under a plain (non-`sync.`-prefixed) key — device state, not
 * Editable Data. Syncing it would suppress the panel on a device still
 * running an older build just because another device already saw its notes.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const LAST_SEEN_VERSION_KEY = 'whatsNew.lastSeenVersion';

export const useLastSeenVersion = createLocalSetting<string | null>({
  key: LAST_SEEN_VERSION_KEY,
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' ? raw : null),
});
