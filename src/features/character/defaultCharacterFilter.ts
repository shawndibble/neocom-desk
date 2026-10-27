/**
 * Which Character(s) a cross-character view (Wallet Balance, Industry Active
 * Jobs, and any that follow) opens on by default — issue #607. Synced: which
 * alts you usually want to see at once is a fact about how you play, not
 * about the device the page happens to be open on.
 *
 * Stored as `StoredCharacterFilterValue` (JSON-safe — no `Set`), never the
 * `CharacterFilterValue` a `CharacterFilterControl` renders directly;
 * `characterFilterValue.ts`'s `fromStoredCharacterFilterValue`/
 * `toStoredCharacterFilterValue` convert at the boundary. `'current'` is the
 * default of the default: unchanged from today's per-page behavior until a
 * pilot opens Settings and picks something wider.
 */
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
