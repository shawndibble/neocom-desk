// "Log out of this device" (Settings → This device): every Character's login
// and local data leave this device, and nothing remote is touched.
//
// It is `removeCharacter` run over the whole roster, after one last push each.
// Synced Editable Data (Skill Plans, Build Plans...) stays on the server until
// the inactivity purge, so logging a Character back in pulls it all again, and
// device-wide settings — the synced defaults, sync configuration — are rows in
// `db.settings` that `removeCharacter` never deletes.

import { db } from '@/db';
import { signOutOfSync } from '@/sync';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';
import { deleteAlertGrantsBestEffort } from '@/features/notifications/alertsGrant';
import { flushSync, removeCharacter, removeSharedBlueprints } from './removeCharacter';

/**
 * @param syncConfigured Whether sync is set up here — gate on
 *   `isSyncConfigured()` at the call site. When true, each Character gets a
 *   last push first, and the Firebase session (which persists on disk) is
 *   signed out at the end.
 * @param removeShared Also delete what each Character shared with its
 *   Communities (issue #3600); the prompt defaults this to yes.
 * @returns How many Characters were logged out.
 */
export async function logoutAllCharacters(
  syncConfigured: boolean,
  removeShared = false
): Promise<number> {
  const characters = await db.characters.toArray();
  const ids = characters.map((character) => character.characterId);
  if (removeShared) await removeSharedBlueprints(ids);
  // Before the sign-out below: deleting a grant needs each Character's sign-in.
  if (syncConfigured) await deleteAlertGrantsBestEffort(ids);
  if (syncConfigured) await flushSync(ids);
  for (const id of ids) {
    await removeCharacter(id, false);
  }
  // A token whose Character row is already gone is still a login on this device.
  await db.tokens.clear();
  // Once for the whole roster, and no rebuild may re-register it afterwards.
  scheduleProjectionRebuild.cancel();
  await unregisterProjectionRegistration();
  if (syncConfigured) {
    await signOutOfSync(ids).catch(() => {
      // Nothing more to undo: the tokens that could re-mint it are gone.
    });
  }
  return ids.length;
}
