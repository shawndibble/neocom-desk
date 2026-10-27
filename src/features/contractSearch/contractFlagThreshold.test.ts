import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  ITEM_FLAG_MULTIPLE_OPTIONS,
  ITEM_FLAG_MULTIPLE_SETTING_KEY,
  useItemFlagMultiple,
} from './contractFlagThreshold';

async function hydrateWith(value: unknown): Promise<number> {
  await db.settings.clear();
  if (value !== undefined) await db.settings.put({ key: ITEM_FLAG_MULTIPLE_SETTING_KEY, value });
  useItemFlagMultiple.setState({ hydrated: false });
  await useItemFlagMultiple.getState().hydrate();
  return useItemFlagMultiple.getState().value;
}

beforeEach(async () => {
  await db.settings.clear();
});

describe('useItemFlagMultiple', () => {
  it('defaults to 10, Market Browser’s factor', async () => {
    expect(await hydrateWith(undefined)).toBe(10);
  });

  it.each(ITEM_FLAG_MULTIPLE_OPTIONS)('keeps the preset %i', async (preset) => {
    expect(await hydrateWith(preset)).toBe(preset);
  });

  it.each([3, 7, '20', null, {}])('falls back to 10 for %j, which is not a preset', async (raw) => {
    expect(await hydrateWith(raw)).toBe(10);
  });
});
