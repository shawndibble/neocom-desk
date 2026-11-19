import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_SHARED_POP_TIME,
  SHARED_POP_TIME_KEY,
  useSharedPopTime,
} from './calendarSharedPopTime';

beforeEach(async () => {
  await db.settings.clear();
  useSharedPopTime.setState({ value: DEFAULT_SHARED_POP_TIME, hydrated: false });
});

describe('useSharedPopTime', () => {
  it('defaults to the time the officer chose', () => {
    expect(useSharedPopTime.getState().value).toBe('asShared');
  });

  it('persists the choice to Dexie and applies it on hydrate', async () => {
    await useSharedPopTime.getState().setValue('autoFracture');
    expect((await db.settings.get(SHARED_POP_TIME_KEY))?.value).toBe('autoFracture');
    useSharedPopTime.setState({ value: DEFAULT_SHARED_POP_TIME, hydrated: false });
    await useSharedPopTime.getState().hydrate();
    expect(useSharedPopTime.getState().value).toBe('autoFracture');
  });

  it('falls back to the default for a stored value it does not know', async () => {
    await db.settings.put({ key: SHARED_POP_TIME_KEY, value: 'tuesday' });
    await useSharedPopTime.getState().hydrate();
    expect(useSharedPopTime.getState().value).toBe('asShared');
  });
});
