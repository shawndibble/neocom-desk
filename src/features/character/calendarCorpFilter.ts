/**
 * The Calendar's corporation filter: every corp event, none, or one
 * corporation's. Device-local, like the hidden kinds beside it.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { BoardCorporation } from '@/engine/character/board';
import type { CorpEventFilter } from '@/engine/character/deadlines';

export const CALENDAR_CORP_FILTER_KEY = 'calendarCorpFilter';

export const DEFAULT_CORP_FILTER: CorpEventFilter = 'all';

export const useCalendarCorpFilter = createLocalSetting<CorpEventFilter>({
  key: CALENDAR_CORP_FILTER_KEY,
  defaultValue: DEFAULT_CORP_FILTER,
  parse: (raw) =>
    raw === 'all' || raw === 'none' || (typeof raw === 'number' && Number.isInteger(raw))
      ? raw
      : null,
});

/**
 * A saved corporation filters nothing once the account can no longer read it,
 * or once it is the only one left: the menu then offers no row to undo it.
 */
export function activeCorpFilter(
  saved: CorpEventFilter,
  corporations: readonly BoardCorporation[]
): CorpEventFilter {
  if (typeof saved !== 'number') return saved;
  const offered = corporations.length > 1 && corporations.some(({ id }) => id === saved);
  return offered ? saved : 'all';
}
