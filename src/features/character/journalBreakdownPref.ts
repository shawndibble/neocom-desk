/**
 * Whether the wallet journal's "Where the ISK went" panel is open. Device-local,
 * like the Fittings view choice: a view preference, never in the URL. `null`
 * means "never toggled", so the default decides: open on desktop when the
 * breakdown is short, folded on a phone or when a long list would push the
 * journal's own rows below the fold.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const JOURNAL_BREAKDOWN_SETTING_KEY = 'walletJournalBreakdownOpen';

export const useJournalBreakdownPref = createLocalSetting<boolean | null>({
  key: JOURNAL_BREAKDOWN_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** More ref types than this and the panel would fill the first screen. */
export const BREAKDOWN_OPEN_MAX_REF_TYPES = 6;

/** The default for a pilot who never toggled the panel. */
export function defaultBreakdownOpen(isNarrow: boolean, refTypeCount: number): boolean {
  return !isNarrow && refTypeCount <= BREAKDOWN_OPEN_MAX_REF_TYPES;
}
