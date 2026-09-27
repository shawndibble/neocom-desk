/**
 * Which day the Calendar's Month/Week grid starts on.
 *
 * Default `'monday'`, matching EVE's own in-game calendar. Device-local like
 * `calendarViewPref.ts`'s density: it changes how one grid draws, not data
 * worth syncing across devices, and a pilot's own read of "the start of the
 * week" is a screen preference the same way text size is.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { WeekStart } from '@/lib/calendarGrid';

export const CALENDAR_WEEK_START_KEY = 'calendarWeekStart';

export const CALENDAR_WEEK_START_DAYS: readonly WeekStart[] = ['monday', 'sunday'];

export const DEFAULT_CALENDAR_WEEK_START: WeekStart = 'monday';

function isWeekStart(value: unknown): value is WeekStart {
  return value === 'monday' || value === 'sunday';
}

export const useCalendarWeekStart = createLocalSetting<WeekStart>({
  key: CALENDAR_WEEK_START_KEY,
  defaultValue: DEFAULT_CALENDAR_WEEK_START,
  parse: (raw) => (isWeekStart(raw) ? raw : null),
});
