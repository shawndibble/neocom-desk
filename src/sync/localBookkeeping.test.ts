import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  clearCharacterSyncBookkeeping,
  heartbeatKey,
  ownerHashKey,
  tombstoneKey,
} from './localBookkeeping';
import { EDITABLE_COLLECTIONS } from './syncedCollections';

beforeEach(async () => {
  await db.settings.clear();
});

describe('clearCharacterSyncBookkeeping', () => {
  it('drops every bookkeeping key for the character, leaving other characters alone', async () => {
    const characterKeys = [
      ownerHashKey(1),
      heartbeatKey('char:1'),
      ...EDITABLE_COLLECTIONS.map((collection) => tombstoneKey(collection, 1)),
    ];
    await db.settings.bulkPut([
      ...characterKeys.map((key) => ({ key, value: [{ id: 'p1', deletedAt: 1 }] })),
      { key: ownerHashKey(2), value: 'hash-b' },
      { key: heartbeatKey('char:2'), value: 1 },
      { key: tombstoneKey(EDITABLE_COLLECTIONS[0]!, 2), value: [{ id: 'p2', deletedAt: 1 }] },
    ]);

    await clearCharacterSyncBookkeeping(1);

    for (const key of characterKeys) {
      expect({ [key]: await db.settings.get(key) }).toEqual({ [key]: undefined });
    }
    expect((await db.settings.get(ownerHashKey(2)))?.value).toBe('hash-b');
    expect((await db.settings.get(heartbeatKey('char:2')))?.value).toBe(1);
    expect(await db.settings.get(tombstoneKey(EDITABLE_COLLECTIONS[0]!, 2))).toBeDefined();
  });

  it('is a no-op when nothing is stored for the character', async () => {
    await expect(clearCharacterSyncBookkeeping(999)).resolves.toBeUndefined();
  });
});
