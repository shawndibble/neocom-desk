/**
 * The retired card board's hidden-cards setting, kept for its read side only.
 *
 * The Overview is a widget grid now (`widgets/`), and nothing writes this list
 * any more. It is still read, for two things: `widgets/migrate.ts` turns it
 * (with the card order) into the first Overview Layout of a pilot who used the
 * old board, and a non-empty list is how the page knows that pilot is
 * returning (the New tags apply to them).
 *
 * The key stays on the synced-settings allow-list and `parse` keeps keys this
 * build has no meaning for: the value merges last-write-wins as a whole, so a
 * build that dropped a key it did not recognise would corrupt another
 * device's copy.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const OVERVIEW_HIDDEN_CARDS_KEY = 'sync.overviewHiddenCards';

/** Any list of strings, deduped — including keys this build has no meaning for. */
export function parseHiddenCards(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((key): key is string => typeof key === 'string'))];
}

export const useOverviewHiddenCards = createSyncedSetting<string[]>({
  key: OVERVIEW_HIDDEN_CARDS_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});
