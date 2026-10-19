// Owner-hash change handling for the sync driver (planSync.ts): when EVE
// reports a new ownerHash for a Character, the previous owner's local data is
// wiped before the next sync.

import { db, type CharacterRecord } from '@/db';
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { clearPullCursors, ownerHashKey, tombstoneKey, writeTombstones } from './localBookkeeping';
import { EDITABLE_COLLECTIONS } from './syncedCollections';

/**
 * EVE changes a character's ownerHash when it is sold or transferred. If it
 * changed since our last sync, the local editable data belongs to the previous
 * owner — wipe it, its tombstones and its cached ESI responses.
 */
export async function handleOwnerHashChange(character: CharacterRecord): Promise<void> {
  const key = ownerHashKey(character.characterId);
  const stored = await db.settings.get(key);
  if (stored !== undefined && stored.value !== character.ownerHash) {
    // Every editable collection, whatever its removal rule: this is the
    // previous owner's data, not a Character the pilot chose to drop.
    for (const collection of EDITABLE_COLLECTIONS) {
      await db.table(collection.table).where('characterId').equals(character.characterId).delete();
    }
    for (const collection of EDITABLE_COLLECTIONS) {
      await writeTombstones(tombstoneKey(collection, character.characterId), []);
    }
    // The new owner's docs can carry an `updatedAt` below the previous owner's
    // high-water mark, so a surviving cursor would hide them entirely.
    await clearPullCursors(character.characterId);
    // Feed rows themselves survive a transfer (they are this device's archive
    // of what it saw, and carry no tombstones), but the new owner's remote
    // collection has never held any of them — so the claim `syncedAt` makes
    // is now false for every one of them, and leaving it set would keep them
    // off the new uid forever.
    await db.notificationFeed
      .where('characterId')
      .equals(character.characterId)
      .modify((row) => {
        delete row.syncedAt;
      });
    // Cached wallet/mail/assets belong to the previous owner just as much as
    // the plans do. `auth/session` purges on the same signal at login; this
    // covers a transfer noticed between logins. Degrades rather than throws
    // (esi/cachePurge.ts) — a failing purge must not fail the sync.
    const outcome = await purgeCharacterCacheOrSuppress(character.characterId);
    // 'suppressed' = both purge tiers failed, rows still on disk. Suppression
    // can be memory-only, so advancing the bookmark would burn the last retry:
    // after a reload the marker is gone, the hash matches and the previous
    // owner's data reads normally. Leaving it makes the next sync re-detect;
    // the plan deletes above are idempotent.
    if (outcome === 'suppressed') return;
  }
  await db.settings.put({ key, value: character.ownerHash });
}
