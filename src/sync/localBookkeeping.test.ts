import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  buildPlanTombstonesKey,
  clearCharacterSyncBookkeeping,
  ownerHashKey,
  planTombstonesKey,
  quickbarTombstonesKey,
  stationPinTombstonesKey,
} from './localBookkeeping';

beforeEach(async () => {
  await db.settings.clear();
});

describe('clearCharacterSyncBookkeeping', () => {
  it('drops every bookkeeping key for the character, leaving other characters alone', async () => {
    await db.settings.bulkPut([
      { key: ownerHashKey(1), value: 'hash-a' },
      { key: planTombstonesKey(1), value: [{ id: 'p1', deletedAt: 1 }] },
      { key: buildPlanTombstonesKey(1), value: [] },
      { key: quickbarTombstonesKey(1), value: [] },
      { key: stationPinTombstonesKey(1), value: [] },
      { key: ownerHashKey(2), value: 'hash-b' },
    ]);

    await clearCharacterSyncBookkeeping(1);

    expect(await db.settings.get(ownerHashKey(1))).toBeUndefined();
    expect(await db.settings.get(planTombstonesKey(1))).toBeUndefined();
    expect(await db.settings.get(buildPlanTombstonesKey(1))).toBeUndefined();
    expect(await db.settings.get(quickbarTombstonesKey(1))).toBeUndefined();
    expect(await db.settings.get(stationPinTombstonesKey(1))).toBeUndefined();
    expect((await db.settings.get(ownerHashKey(2)))?.value).toBe('hash-b');
  });

  it('is a no-op when nothing is stored for the character', async () => {
    await expect(clearCharacterSyncBookkeeping(999)).resolves.toBeUndefined();
  });
});
