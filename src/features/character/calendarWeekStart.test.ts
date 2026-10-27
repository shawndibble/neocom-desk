import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useCalendarWeekStart,
  CALENDAR_WEEK_START_KEY,
  DEFAULT_CALENDAR_WEEK_START,
} from './calendarWeekStart';

beforeEach(async () => {
  await db.settings.clear();
  useCalendarWeekStart.setState({ value: DEFAULT_CALENDAR_WEEK_START, hydrated: false });
});

describe('useCalendarWeekStart', () => {
  it('defaults to monday, unhydrated', () => {
    expect(useCalendarWeekStart.getState().value).toBe('monday');
    expect(useCalendarWeekStart.getState().hydrated).toBe(false);
  });

  it('persists the choice to Dexie under the calendarWeekStart key', async () => {
    await useCalendarWeekStart.getState().setValue('sunday');
    expect((await db.settings.get(CALENDAR_WEEK_START_KEY))?.value).toBe('sunday');
  });

  it('applies the persisted day on hydrate', async () => {
    await db.settings.put({ key: CALENDAR_WEEK_START_KEY, value: 'sunday' });
    await useCalendarWeekStart.getState().hydrate();
    expect(useCalendarWeekStart.getState().value).toBe('sunday');
  });

  it('falls back to the default when the stored value is not a week-start day', async () => {
    await db.settings.put({ key: CALENDAR_WEEK_START_KEY, value: 'tuesday' });
    await useCalendarWeekStart.getState().hydrate();
    expect(useCalendarWeekStart.getState().value).toBe('monday');
  });
});
