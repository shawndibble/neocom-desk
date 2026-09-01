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
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { clearCharacterSyncBookkeeping, purgeCharacterRemoteDataOrDefer } from '@/sync';
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
 */
export async function removeCharacter(
  characterId: number,
  attemptRemotePurge: boolean
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
  await clearCharacterSyncBookkeeping(characterId);
  await purgeCharacterCacheOrSuppress(characterId);

  const { activeCharacterId, setActiveCharacter, clearActiveCharacter } =
    useActiveCharacter.getState();
  if (activeCharacterId === characterId) {
    const next = await db.characters.orderBy('characterId').first();
    if (next) await setActiveCharacter(next.characterId);
    else await clearActiveCharacter();
  }

  return { remotePurged };
}
