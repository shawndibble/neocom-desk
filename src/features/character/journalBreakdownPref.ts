/**
 * Whether the wallet journal's "Where the ISK went" panel is open. Device-local,
 * like the Fittings view choice: a view preference, never in the URL. `null`
 * means "never toggled", so the breakpoint decides: open on desktop, folded on
 * a phone where the headline alone answers the question.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const JOURNAL_BREAKDOWN_SETTING_KEY = 'walletJournalBreakdownOpen';

export const useJournalBreakdownPref = createLocalSetting<boolean | null>({
  key: JOURNAL_BREAKDOWN_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});
