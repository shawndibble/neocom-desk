/** Device-local Calendar view choice (Month/Week/Agenda), persisted like `src/lib/fontScale.ts`. */
import { createLocalSetting } from '@/lib/useLocalSetting';

export type CalendarViewMode = 'month' | 'week' | 'agenda';

export const CALENDAR_VIEW_KEY = 'calendarView';

export const DEFAULT_CALENDAR_VIEW: CalendarViewMode = 'month';

function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === 'month' || value === 'week' || value === 'agenda';
}

export const useCalendarView = createLocalSetting<CalendarViewMode>({
  key: CALENDAR_VIEW_KEY,
  defaultValue: DEFAULT_CALENDAR_VIEW,
  parse: (raw) => (isCalendarViewMode(raw) ? raw : null),
});
