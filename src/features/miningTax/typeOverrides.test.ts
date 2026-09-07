import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  loadManualIgnoredTypeIds,
  loadManualMoonOreTypeIds,
  loadTypeOverrides,
  tagAsIgnored,
  tagAsMoonOre,
  untagIgnored,
  untagMoonOre,
} from './typeOverrides';

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

describe('tagAsIgnored', () => {
  it('is empty when nothing has been ignored', async () => {
    expect(await loadManualIgnoredTypeIds()).toEqual([]);
  });

  it('adds a typeId to its own, independent override list', async () => {
    await tagAsIgnored(888888);
    expect(await loadManualIgnoredTypeIds()).toEqual([888888]);
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
  });

  it('is idempotent', async () => {
    await tagAsIgnored(888888);
    await tagAsIgnored(888888);
    expect(await loadManualIgnoredTypeIds()).toEqual([888888]);
  });
});

describe('untagMoonOre', () => {
  it('removes a typeId, returning it to unclassified', async () => {
    await tagAsMoonOre(999999);
    await untagMoonOre(999999);
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
  });

  it('leaves the other tagged ids alone', async () => {
    await tagAsMoonOre(1);
    await tagAsMoonOre(2);
    await tagAsMoonOre(3);
    await untagMoonOre(2);
    expect(await loadManualMoonOreTypeIds()).toEqual([1, 3]);
  });

  it('never touches the ignored list', async () => {
    await tagAsMoonOre(5);
    await tagAsIgnored(5);
    await untagMoonOre(5);
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
    expect(await loadManualIgnoredTypeIds()).toEqual([5]);
  });

  it('is a no-op for a typeId that was never tagged', async () => {
    await tagAsMoonOre(1);
    await untagMoonOre(404);
    expect(await loadManualMoonOreTypeIds()).toEqual([1]);
  });

  it('is a no-op when nothing has ever been tagged', async () => {
    await untagMoonOre(404);
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
  });
});

describe('untagIgnored', () => {
  it('removes a typeId from its own list only', async () => {
    await tagAsIgnored(888888);
    await tagAsMoonOre(777777);
    await untagIgnored(888888);
    expect(await loadManualIgnoredTypeIds()).toEqual([]);
    expect(await loadManualMoonOreTypeIds()).toEqual([777777]);
  });
});

describe('loadTypeOverrides', () => {
  it('reads both lists in one call', async () => {
    await tagAsMoonOre(1);
    await tagAsIgnored(2);
    expect(await loadTypeOverrides()).toEqual({ moonOreTypeIds: [1], ignoredTypeIds: [2] });
  });

  it('reports empty lists rather than throwing when nothing is tagged', async () => {
    expect(await loadTypeOverrides()).toEqual({ moonOreTypeIds: [], ignoredTypeIds: [] });
  });
});
