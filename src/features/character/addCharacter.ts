// Adding a Character to the app (issue #432, CONTEXT.md round 52) — the
// counterpart to removeCharacter.ts, and it lives here for the same reason:
// `src/sync` already imports `@/auth/session` (syncAuth.ts, deviceRegistration
// .ts), so `auth/session.ts` cannot import `@/sync` back without a cycle. The
// features layer is where the two are allowed to meet.
//
// What it adds on top of `completeLogin` is the account-wide backfill. Round
// 7's fan-out writes one row per Character *known on this device at the time*,
// which leaves a Character added later without the account-wide Editable Data
// everyone else has. This is the one moment that gap can be closed.

import { completeLogin } from '@/auth/session';
import type { CharacterRecord } from '@/db';
import { db } from '@/db';
import { backfillAccountWideData, scheduleSync } from '@/sync';

/**
 * Complete the SSO callback, then give a Character new to this device the
 * account-wide Editable Data the rest of the account already holds.
 *
 * Two deliberate non-events:
 * - **A Character already on this device** gets no backfill. That covers a
 *   re-grant for new scopes and a sold Character returning under a new
 *   ownerHash — whose Editable Data `handleOwnerHashChange` has just purged on
 *   purpose, so re-seeding it here would undo that.
 * - **A backfill that throws** is swallowed. By the time it runs the login has
 *   completed and the token is stored, so letting it reject would send the
 *   callback route to its error panel for a Character that is signed in. A
 *   missing pin is worth strictly less than a lost session.
 *
 * Deliberately *not* gated on `isSyncConfigured()`, unlike `removeCharacter`'s
 * remote purge. That gate is for operations that talk to a backend; this one
 * only copies Dexie rows sideways, and an account-wide pin is just as much the
 * new Character's on a device that never syncs. `scheduleSync` is left
 * unconditional for the same reason it is everywhere else — it is
 * fire-and-forget and already a no-op when there is nothing to sync to.
 */
export async function addCharacter(params: {
  code: string;
  state: string;
}): Promise<CharacterRecord> {
  // Which Characters this device knew *before* the login. The id being signed
  // in is not known until `completeLogin` decodes the token, and by then it
  // has already written the record — so "is this one new?" has to be answered
  // against a snapshot taken first.
  const knownBefore = new Set(await db.characters.toCollection().primaryKeys());

  const character = await completeLogin(params);
  if (knownBefore.has(character.characterId)) return character;

  try {
    if (await backfillAccountWideData(character.characterId)) {
      scheduleSync(character.characterId);
    }
  } catch {
    // See "a backfill that throws" above: the session is already established
    // and is worth more than the rows this would have copied.
  }
  return character;
}
