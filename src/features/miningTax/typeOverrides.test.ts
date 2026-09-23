import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const MOON_ORE_KEY = 'sync.miningTaxManualMoonOreTypeIds';
const IGNORED_KEY = 'sync.miningTaxManualIgnoredTypeIds';
const LEGACY_MOON_ORE_KEY = 'miningTax.manualMoonOreTypeIds';
const LEGACY_IGNORED_KEY = 'miningTax.manualIgnoredTypeIds';

const setSyncedSetting = vi.fn<(key: string, value: unknown) => Promise<void>>();
const scheduleSync = vi.fn<(characterId: number) => void>();
let syncConfigured = false;

vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => syncConfigured,
}));

vi.mock('@/sync', () => ({
  setSyncedSetting: (key: string, value: unknown) => setSyncedSetting(key, value),
  scheduleSync: (characterId: number) => scheduleSync(characterId),
}));

beforeEach(async () => {
  await db.settings.clear();
  await db.characters.clear();
  syncConfigured = false;
  setSyncedSetting.mockReset();
  setSyncedSetting.mockResolvedValue(undefined);
  scheduleSync.mockReset();
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

describe('legacy adoption', () => {
  it('adopts a pre-sync moon-ore tag list, unstamped, under the new key', async () => {
    await db.settings.put({ key: LEGACY_MOON_ORE_KEY, value: [111, 222] });

    expect(await loadManualMoonOreTypeIds()).toEqual([111, 222]);
    expect((await db.settings.get(MOON_ORE_KEY))?.value).toEqual([111, 222]);
    // Adoption is a bare put, not a synced write — no push for a value that
    // was already on this device.
    expect(setSyncedSetting).not.toHaveBeenCalled();
  });

  it('adopts a pre-sync ignored list independently of the moon-ore one', async () => {
    await db.settings.put({ key: LEGACY_IGNORED_KEY, value: [333] });

    expect(await loadManualIgnoredTypeIds()).toEqual([333]);
    expect(await loadManualMoonOreTypeIds()).toEqual([]);
  });

  it('prefers the new key once it exists, ignoring the legacy one', async () => {
    await db.settings.put({ key: LEGACY_MOON_ORE_KEY, value: [999] });
    await db.settings.put({ key: MOON_ORE_KEY, value: [1] });

    expect(await loadManualMoonOreTypeIds()).toEqual([1]);
  });
});

describe('syncing a tag change', () => {
  it('does nothing sync-side when sync is not configured', async () => {
    await tagAsMoonOre(1);
    expect(setSyncedSetting).not.toHaveBeenCalled();
    expect(scheduleSync).not.toHaveBeenCalled();
  });

  it('pushes the moon-ore list and schedules every tracked character when sync is configured', async () => {
    syncConfigured = true;
    await db.characters.bulkPut([
      { characterId: 1, name: 'A', ownerHash: 'oh', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'oh', addedAt: 0 },
    ]);

    await tagAsMoonOre(999999);

    expect(setSyncedSetting).toHaveBeenCalledWith(MOON_ORE_KEY, [999999]);
    expect(scheduleSync).toHaveBeenCalledWith(1);
    expect(scheduleSync).toHaveBeenCalledWith(2);
  });

  it('pushes the ignored list under its own key', async () => {
    syncConfigured = true;
    await db.characters.bulkPut([{ characterId: 1, name: 'A', ownerHash: 'oh', addedAt: 0 }]);

    await tagAsIgnored(888888);

    expect(setSyncedSetting).toHaveBeenCalledWith(IGNORED_KEY, [888888]);
  });

  it('still lands the tag locally when the sync push rejects', async () => {
    syncConfigured = true;
    setSyncedSetting.mockRejectedValueOnce(new Error('offline'));

    await tagAsMoonOre(1);

    expect(await loadManualMoonOreTypeIds()).toEqual([1]);
  });

  it('pushes on untag too', async () => {
    await tagAsMoonOre(1);
    syncConfigured = true;

    await untagMoonOre(1);

    expect(setSyncedSetting).toHaveBeenCalledWith(MOON_ORE_KEY, []);
  });
});
