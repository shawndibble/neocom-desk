import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useCalendarView, CALENDAR_VIEW_KEY, DEFAULT_CALENDAR_VIEW } from './calendarViewPref';

beforeEach(async () => {
  await db.settings.clear();
  useCalendarView.setState({ value: DEFAULT_CALENDAR_VIEW, hydrated: false });
});

describe('useCalendarView', () => {
  it('defaults to month, unhydrated', () => {
    expect(useCalendarView.getState().value).toBe('month');
    expect(useCalendarView.getState().hydrated).toBe(false);
  });

  it('persists the choice to Dexie under the calendarView key', async () => {
    await useCalendarView.getState().setValue('week');
    expect((await db.settings.get(CALENDAR_VIEW_KEY))?.value).toBe('week');
  });

  it('applies the persisted view on hydrate', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'agenda' });
    await useCalendarView.getState().hydrate();
    expect(useCalendarView.getState().value).toBe('agenda');
  });

  it('falls back to the default when the stored value is not a valid view', async () => {
    await db.settings.put({ key: CALENDAR_VIEW_KEY, value: 'day' });
    await useCalendarView.getState().hydrate();
    expect(useCalendarView.getState().value).toBe('month');
  });
});
