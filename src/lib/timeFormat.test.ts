import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { readTimeZone, TIME_FORMAT_SETTING_KEY } from './timeFormat';

describe('readTimeZone', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('is the host zone when nothing is stored', async () => {
    expect(await readTimeZone()).toBeUndefined();
  });

  it('is UTC when the pilot picked EVE time', async () => {
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'eve' });
    expect(await readTimeZone()).toBe('UTC');
  });

  it('is the host zone for local or an unreadable value', async () => {
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'local' });
    expect(await readTimeZone()).toBeUndefined();
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'garbage' });
    expect(await readTimeZone()).toBeUndefined();
  });
});
