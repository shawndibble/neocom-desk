import { db, type CharacterRecord } from '@/db';
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { clearPullCursors, ownerHashKey, tombstoneKey } from './localBookkeeping';
import { EDITABLE_COLLECTIONS } from './syncedCollections';

export async function handleOwnerHashChange(character: CharacterRecord): Promise<boolean> {
  const key = ownerHashKey(character.characterId);
  const stored = await db.settings.get(key);
  const wiped = stored !== undefined && stored.value !== character.ownerHash;
  if (wiped) {
    const tables = [
      ...EDITABLE_COLLECTIONS.map((collection) => db.table(collection.table)),
      db.settings,
      db.notificationFeed,
    ];
    await db.transaction('rw', tables, async () => {
      await Promise.all(
        EDITABLE_COLLECTIONS.map((collection) =>
          db.table(collection.table).where('characterId').equals(character.characterId).delete()
        )
      );
      await db.settings.bulkPut(
        EDITABLE_COLLECTIONS.map((collection) => ({
          key: tombstoneKey(collection, character.characterId),
          value: [],
        }))
      );
      await clearPullCursors(character.characterId);
      await db.notificationFeed
        .where('characterId')
        .equals(character.characterId)
        .modify((row) => {
          delete row.syncedAt;
        });
    });
    const outcome = await purgeCharacterCacheOrSuppress(character.characterId);
    if (outcome === 'suppressed') return true;
  }
  await db.settings.put({ key, value: character.ownerHash });
  return wiped;
}
