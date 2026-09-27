// Removing a Character from the app (parity plan §5.7 item 3): local Dexie
// rows for it are deleted (per each synced collection's `onRemoval` rule in
// sync/syncedCollections.ts). Its remote Editable Data (CONTEXT.md) is left
// alone: the `purgeStaleAccounts` Cloud Function deletes it once no device
// has synced the Character for 90 days (issue #2066). Adding the Character
// back before then pulls it all again — the pull cursors go with the local
// rows.
//
// Unlike a sold Character (detected via a changed ownerHash, handled by
// sync/planSync.handleOwnerHashChange), this is the user *choosing* to drop
// a Character they still hold — there is no signal to detect it from, so it
// needs its own explicit entry point.

import { db } from '@/db';
import { purgeCharacterCacheOrSuppress, purgeSharedStructureCache } from '@/esi/cachePurge';
import { clearCharacterSyncBookkeeping } from '@/sync';
import { EDITABLE_COLLECTIONS } from '@/sync/syncedCollections';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { deleteFeedForCharacter } from '@/features/notifications/feed';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * @param syncPush Whether to bring this device's Scheduled Push registration in
 *   line with the remaining roster. `logoutAllCharacters` turns it off and
 *   unregisters once itself, rather than once per Character.
 */
export async function removeCharacter(characterId: number, syncPush = true): Promise<void> {
  await db.characters.delete(characterId);
  await db.tokens.delete(characterId);
  for (const collection of EDITABLE_COLLECTIONS) {
    if (collection.onRemoval !== 'delete') continue;
    await db.table(collection.table).where('characterId').equals(characterId).delete();
  }
  await db.orderProblemSamples.where('characterId').equals(characterId).delete();
  await db.mailDrafts.where('characterId').equals(characterId).delete();
  await db.miningLedgerHistory.delete(characterId);
  // Orphaned feed rows are invisible in the UI (both the Overview list and the
  // other-character counts skip ids with no Character) but `refreshAppBadge`
  // counts the whole table — leaving an app-icon count nothing can dismiss.
  await deleteFeedForCharacter(characterId);
  await clearCharacterSyncBookkeeping(characterId);
  await refreshAppBadge();
  await purgeCharacterCacheOrSuppress(characterId);
  // Not part of that purge: the shared rows aren't this Character's own —
  // they survive as long as the roster does, and only stop being that
  // roster's own knowledge once nobody in it is left (esi/cachePurge.ts).
  const remaining = await db.characters.count();
  if (remaining === 0) {
    await purgeSharedStructureCache();
  }
  // This device's own push registration follows its roster: gone with the
  // last Character, re-uploaded without this one otherwise. The removed
  // Character's stored Projection is left alone (other devices keep it).
  if (syncPush) {
    if (remaining === 0) {
      scheduleProjectionRebuild.cancel();
      await unregisterProjectionRegistration();
    } else {
      scheduleProjectionRebuild(Promise.resolve());
    }
  }

  const { activeCharacterId, setActiveCharacter, clearActiveCharacter } =
    useActiveCharacter.getState();
  if (activeCharacterId === characterId) {
    const next = await db.characters.orderBy('characterId').first();
    if (next) await setActiveCharacter(next.characterId);
    else await clearActiveCharacter();
  }
}
