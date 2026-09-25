// Removing a Character from the app (parity plan §5.7 item 3): local Dexie
// rows for it are always deleted; its remote Editable Data (Skill Plans,
// Build Plans, Quickbar, synced settings — CONTEXT.md) is purged inline when
// a session can still be established as it, or deferred to the next time it
// authenticates when the refresh token is already dead — the common case for
// dropping a sold Character (see sync/characterPurge.ts).
//
// Unlike a sold Character (detected via a changed ownerHash, handled by
// sync/planSync.handleOwnerHashChange), this is the user *choosing* to drop
// a Character they still hold — there is no signal to detect it from, so it
// needs its own explicit entry point.

import { db } from '@/db';
import { purgeCharacterCacheOrSuppress, purgeSharedStructureCache } from '@/esi/cachePurge';
import { clearCharacterSyncBookkeeping, purgeCharacterRemoteDataOrDefer } from '@/sync';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { deleteFeedForCharacter } from '@/features/notifications/feed';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface RemoveCharacterResult {
  /**
   * False when a remote purge was attempted but could not run now, and was
   * deferred instead (dead refresh token, offline). True both when it
   * succeeded and when `attemptRemotePurge` was false — sync unconfigured
   * means there is nothing remote to have deferred.
   */
  remotePurged: boolean;
}

/**
 * @param attemptRemotePurge Whether to try purging remote Firestore docs at
 *   all — gate this on `isSyncConfigured()` at the call site (routes already
 *   do the same for `scheduleSync`/`triggerSync`, see app/syncStatus.ts).
 *   With sync unconfigured there is nothing remote to purge, and attempting
 *   it would just fail and record a marker that can never be retried.
 * @param syncPush Whether to bring this device's Scheduled Push registration in
 *   line with the remaining roster. `logoutAllCharacters` turns it off and
 *   unregisters once itself, rather than once per Character.
 */
export async function removeCharacter(
  characterId: number,
  attemptRemotePurge: boolean,
  syncPush = true
): Promise<RemoveCharacterResult> {
  const remotePurged = attemptRemotePurge
    ? await purgeCharacterRemoteDataOrDefer(characterId)
    : true;

  await db.characters.delete(characterId);
  await db.tokens.delete(characterId);
  await db.skillPlans.where('characterId').equals(characterId).delete();
  await db.buildPlans.where('characterId').equals(characterId).delete();
  await db.quickbars.where('characterId').equals(characterId).delete();
  await db.stationPins.where('characterId').equals(characterId).delete();
  await db.planetRichness.where('characterId').equals(characterId).delete();
  await db.payees.where('characterId').equals(characterId).delete();
  await db.fittings.where('characterId').equals(characterId).delete();
  await db.miningTaxAssignments.where('characterId').equals(characterId).delete();
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

  return { remotePurged };
}
