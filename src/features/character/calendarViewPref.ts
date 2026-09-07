/**
 * How much of the calendar the Calendar Map draws at once — a whole month, or
 * the fortnight around today.
 *
 * This used to be the Month / Week / Agenda view switcher. With the map and
 * the Coming Up Rail on screen together, "seven days at a time" stopped being
 * a different *view* and became a zoom level on the same one, so the setting
 * survives with a narrower meaning rather than being replaced.
 *
 * **The Dexie key stays `calendarView`.** Renaming it to something like
 * `calendarDensity` would read better and would orphan a row on every device
 * that has ever opened this page — the old value would sit there unread while
 * the pilot's choice silently reset. `parse` maps the three retired values
 * onto the two that remain instead, which also handles the case that made a
 * migration necessary in the first place: a stale `'week'` arriving from
 * another device long after this shipped.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export type CalendarDensity = 'month' | 'fortnight';

export const CALENDAR_VIEW_KEY = 'calendarView';

export const DEFAULT_CALENDAR_DENSITY: CalendarDensity = 'month';

function isCalendarDensity(value: unknown): value is CalendarDensity {
  return value === 'month' || value === 'fortnight';
}

/**
 * The retired view modes, mapped onto the density that best preserves what the
 * pilot had actually chosen. `'week'` was the seven-day grid, so it lands on
 * the fortnight; `'agenda'` had no grid at all and its closest surviving
 * relative is the rail, which is now always on screen — so it takes the
 * default month rather than pretending to be a density it never was.
 */
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
