import { createLocalSetting } from '@/lib/useLocalSetting';

export type JournalBreakdownView = 'type' | 'party';

export const JOURNAL_BREAKDOWN_VIEW_KEY = 'walletJournalBreakdownView';

export const useJournalBreakdownView = createLocalSetting<JournalBreakdownView>({
  key: JOURNAL_BREAKDOWN_VIEW_KEY,
  defaultValue: 'type',
  parse: (raw) => (raw === 'type' || raw === 'party' ? raw : null),
});
