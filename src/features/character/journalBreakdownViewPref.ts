/**
 * Which list "Where the ISK went" shows (issue #5602): the ref-type rows or the
 * Journal Party rows. Remembered on this device, like the other view preferences
 * `VIEW_PREFERENCE_KEYS` clears.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export type JournalBreakdownView = 'type' | 'party';

export const JOURNAL_BREAKDOWN_VIEW_KEY = 'walletJournalBreakdownView';

export const useJournalBreakdownView = createLocalSetting<JournalBreakdownView>({
  key: JOURNAL_BREAKDOWN_VIEW_KEY,
  defaultValue: 'type',
  parse: (raw) => (raw === 'type' || raw === 'party' ? raw : null),
});
