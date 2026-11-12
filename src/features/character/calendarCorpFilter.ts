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

/** A saved corporation the account can no longer read filters nothing. */
export function activeCorpFilter(
  saved: CorpEventFilter,
  corporations: readonly BoardCorporation[]
): CorpEventFilter {
  if (typeof saved !== 'number') return saved;
  return corporations.some((corporation) => corporation.id === saved) ? saved : 'all';
}
