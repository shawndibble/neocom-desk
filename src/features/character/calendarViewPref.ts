import { createLocalSetting } from '@/lib/useLocalSetting';

export type CalendarDensity = 'month' | 'fortnight';

export const CALENDAR_VIEW_KEY = 'calendarView';

export const DEFAULT_CALENDAR_DENSITY: CalendarDensity = 'month';

function isCalendarDensity(value: unknown): value is CalendarDensity {
  return value === 'month' || value === 'fortnight';
}

function migrateViewMode(value: unknown): CalendarDensity | null {
  if (value === 'week') return 'fortnight';
  if (value === 'agenda') return 'month';
  return null;
}

export const useCalendarDensity = createLocalSetting<CalendarDensity>({
  key: CALENDAR_VIEW_KEY,
  defaultValue: DEFAULT_CALENDAR_DENSITY,
  parse: (raw) => (isCalendarDensity(raw) ? raw : migrateViewMode(raw)),
});
