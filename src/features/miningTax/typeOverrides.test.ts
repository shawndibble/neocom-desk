import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { loadManualMoonOreTypeIds, tagAsMoonOre } from './typeOverrides';

beforeEach(async () => {
  await db.settings.clear();
});

describe('loadManualMoonOreTypeIds', () => {
  it('is empty when nothing has been tagged', async () => {
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
  });
});

describe('tagAsMoonOre', () => {
  it('adds a typeId to the override list', async () => {
    await tagAsMoonOre(999999);
    expect(await loadManualMoonOreTypeIds()).toEqual([999999]);
  });

  it('is idempotent — tagging the same typeId twice does not duplicate it', async () => {
    await tagAsMoonOre(999999);
    await tagAsMoonOre(999999);
    expect(await loadManualMoonOreTypeIds()).toEqual([999999]);
  });

  it('accumulates multiple distinct tags', async () => {
    await tagAsMoonOre(1);
    await tagAsMoonOre(2);
    expect(await loadManualMoonOreTypeIds()).toEqual([1, 2]);
  });
});
