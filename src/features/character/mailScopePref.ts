/**
 * Whether Mail shows This character or All characters, remembered across
 * visits (issue #2867). Device-wide in Dexie, like the folder selection
 * (`mailFolderPref.ts`): which mailboxes you read together is a habit of the
 * pilot, not a fact about one Character. The URL `scope` param overrides it
 * for one view and is never written back.
 *
 * Stored as `'current' | 'all'` — the `CharacterFilterValue` the shared
 * `CharacterFilterControl` already speaks.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { CharacterFilterValue } from './characterFilterValue';

export const MAIL_SCOPE_SETTING_KEY = 'mailScope';

export const useMailScope = createLocalSetting<CharacterFilterValue>({
  key: MAIL_SCOPE_SETTING_KEY,
  defaultValue: 'current',
  parse: (raw) => (raw === 'current' || raw === 'all' ? raw : null),
});
