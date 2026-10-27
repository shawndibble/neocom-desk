import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useCalendarDensity,
  CALENDAR_VIEW_KEY,
  DEFAULT_CALENDAR_DENSITY,
} from './calendarViewPref';

beforeEach(async () => {
  await db.settings.clear();
  useCalendarDensity.setState({ value: DEFAULT_CALENDAR_DENSITY, hydrated: false });
});

describe('useCalendarDensity', () => {
  it('defaults to month, unhydrated', () => {
    expect(useCalendarDensity.getState().value).toBe('month');
    expect(useCalendarDensity.getState().hydrated).toBe(false);
  });

  it('persists the choice to Dexie under the calendarView key', async () => {
    await useCalendarDensity.getState().setValue('fortnight');
    expect((await db.settings.get(CALENDAR_VIEW_KEY))?.value).toBe('fortnight');
  });

  it('applies the persisted density on hydrate', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'fortnight' });
    await useCalendarDensity.getState().hydrate();
    expect(useCalendarDensity.getState().value).toBe('fortnight');
  });

  /**
   * The migration that matters: this key held 'month' | 'week' | 'agenda' for
   * the whole life of the old view switcher, and a device that has not opened
   * the page since still holds one of those. Rejecting it outright would
   * silently reset a pilot who had deliberately chosen the seven-day grid.
   */
  it('maps the retired week view onto the fortnight density', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'week' });
    await useCalendarDensity.getState().hydrate();
    expect(useCalendarDensity.getState().value).toBe('fortnight');
  });

  /** Agenda had no grid at all, so it takes the default rather than a density it never expressed. */
  it('maps the retired agenda view onto the default month density', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'agenda' });
    await useCalendarDensity.getState().hydrate();
    expect(useCalendarDensity.getState().value).toBe('month');
  });

  it('falls back to the default when the stored value is not a density at all', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'day' });
    await useCalendarDensity.getState().hydrate();
    expect(useCalendarDensity.getState().value).toBe('month');
  });
});
