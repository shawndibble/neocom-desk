// "Log out of this device" (Settings → This device): every Character's login
// and local data leave this browser, and nothing remote is touched.
//
// It is `removeCharacter` run over the whole roster with the remote purge
// switched off, which is the whole difference from removing one Character:
// that action deletes the Character's synced Editable Data (Skill Plans, Build
// Plans...) from Firestore, this one only forgets it locally. Logging a
// Character back in pulls it all again (the pull cursors go with the local
// rows, so nothing is skipped as "already seen"), and device-wide settings —
// the synced defaults, sync configuration — are rows in `db.settings` that
// `removeCharacter` never deletes.

import { db } from '@/db';
import { signOutOfSync, triggerSync } from '@/sync';
import { removeCharacter } from './removeCharacter';

/**
 * How long the last pushes may take, all together, before logout goes ahead
 * without them. A push that hangs (offline, a stalled chunk load) must not
 * keep a pilot signed in on a machine they are trying to leave.
 *
 * A push that outlives this is abandoned, not cancelled: it may still write
 * rows for a Character that is already gone. That is a stale local copy of
 * data that is also on the server, not a login, and only ever follows a hang.
 */
export const SYNC_FLUSH_TIMEOUT_MS = 8_000;

/**
 * Best-effort push of every Character's unsynced edits. Logout deletes the
 * local rows and their tombstones, so an edit still waiting for its debounced
 * sync would otherwise be lost; a failure here only means it is.
 */
async function flushSync(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SYNC_FLUSH_TIMEOUT_MS);
  });
  const pushes = Promise.allSettled(characterIds.map((id) => triggerSync(id)));
  try {
    await Promise.race([pushes, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param syncConfigured Whether sync is set up here — gate on
 *   `isSyncConfigured()` at the call site, as `removeCharacter`'s
 *   `attemptRemotePurge` is. When true, each Character gets a last push first,
 *   and the Firebase session (which persists on disk) is signed out at the end.
 * @returns How many Characters were logged out.
 */
export async function logoutAllCharacters(syncConfigured: boolean): Promise<number> {
  const characters = await db.characters.toArray();
  const ids = characters.map((character) => character.characterId);
  if (syncConfigured) await flushSync(ids);
  for (const id of ids) {
    await removeCharacter(id, false);
  }
  // A token whose Character row is already gone is still a login on this device.
  await db.tokens.clear();
  if (syncConfigured) {
    await signOutOfSync().catch(() => {
      // Nothing more to undo: the tokens that could re-mint it are gone.
    });
  }
  return ids.length;
}
