import { createLocalSetting } from '@/lib/useLocalSetting';
import type { BoardCorporation } from '@/engine/character/board';
import type { CorpEventFilter } from '@/engine/character/deadlines';

export const CALENDAR_CORP_FILTER_KEY = 'calendarCorpFilter';

export const DEFAULT_CORP_FILTER: CorpEventFilter = 'all';

export const useCalendarCorpFilter = createLocalSetting<CorpEventFilter>({
  key: CALENDAR_CORP_FILTER_KEY,
  defaultValue: DEFAULT_CORP_FILTER,
  parse: (raw) => (raw === 'none' ? raw : parseOneOrAll(raw)),
});

function parseOneOrAll(raw: unknown): CorpEventFilter | null {
  return raw === 'all' || (typeof raw === 'number' && Number.isInteger(raw)) ? raw : null;
}

export const CALENDAR_SHARING_CORP_FILTER_KEY = 'calendarSharingCorpFilter';

export const useCalendarSharingCorpFilter = createLocalSetting<CorpEventFilter>({
  key: CALENDAR_SHARING_CORP_FILTER_KEY,
  defaultValue: DEFAULT_CORP_FILTER,
  parse: parseOneOrAll,
});

export function activeCorpFilter(
  saved: CorpEventFilter,
  corporations: readonly BoardCorporation[]
): CorpEventFilter {
  if (typeof saved !== 'number') return saved;
  const offered = corporations.length > 1 && corporations.some(({ id }) => id === saved);
  return offered ? saved : 'all';
}
