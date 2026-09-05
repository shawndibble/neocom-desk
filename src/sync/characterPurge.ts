// Remote-data purge for a removed Character (parity plan §5.7 item 3): the
// delete counterpart to planSync's push/pull, for every piece of Editable
// Data (CONTEXT.md) a Character owns — plans, buildPlans, quickbars,
// stationPins, planetRichness, settings, notificationFeed, productionRuns,
// productionSaleLinks, productionOrderWatches under /characters/{uid}.
//
// Firestore rules grant `delete` uid-only, unlike `get`/`update`, which also
// require an ownerHash match (see firestore.rules) — the same rule that lets
// a sold Character's new owner clear the stale docs left behind lets a
// dropped Character's docs be purged by any session that can still sign in
// as it, hash or no hash.
//
// Signing in needs a live refresh token. `features/character/removeCharacter`
// (the caller) deletes that token locally right after this runs, so if it was
// already dead — the common case: the Character is being dropped precisely
// because it's gone — the purge can't run inline. This records a pending
// purge instead (device-local `db.settings` marker, mirroring
// esi/cachePurge's pattern) for `sync/planSync.syncCharacter` to retry the
// next time this Character authenticates and syncs.
//
// Caveat, by design: if the user never signs in as this Character again, the
// remote docs stay. Only a privileged Cloud Function could guarantee the
// purge, and that is a new trust surface this app does not take on.

import { collection, deleteDoc, doc, getDocs, type Firestore } from 'firebase/firestore/lite';
import { db } from '@/db';
import { getSyncFirestore } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';

const REMOTE_COLLECTIONS = [
  'plans',
  'buildPlans',
  'quickbars',
  'stationPins',
  'planetRichness',
  'settings',
  'notificationFeed',
  'productionRuns',
  'productionSaleLinks',
  'productionOrderWatches',
] as const;

/** Marker prefix in `db.settings`. Device-local; mirrors `esi/cachePurge.ts`. */
export const REMOTE_PURGE_PENDING_PREFIX = 'remotePurgePending.';

export const remotePurgePendingKey = (characterId: number): string =>
  `${REMOTE_PURGE_PENDING_PREFIX}${characterId}`;

async function markPending(characterId: number): Promise<void> {
  await db.settings.put({ key: remotePurgePendingKey(characterId), value: true });
}

async function isPending(characterId: number): Promise<boolean> {
  return (await db.settings.get(remotePurgePendingKey(characterId))) !== undefined;
}

async function clearPending(characterId: number): Promise<void> {
  await db.settings.delete(remotePurgePendingKey(characterId));
}

async function deleteAllDocs(firestore: Firestore, uid: string, name: string): Promise<void> {
  const col = collection(firestore, 'characters', uid, name);
  const snapshot = await getDocs(col);
  await Promise.all(snapshot.docs.map((d) => deleteDoc(doc(col, d.id))));
}

/**
 * Delete every remote Firestore doc owned by one Character, across every
 * Editable Data collection. Throws on failure (dead refresh token, offline,
 * Firebase misconfigured) — callers decide how to degrade.
 */
export async function purgeCharacterRemoteData(characterId: number): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  for (const name of REMOTE_COLLECTIONS) {
    await deleteAllDocs(firestore, uid, name);
  }
}

/**
 * Purge now; if it can't run, record a pending purge for
 * `retryPendingRemotePurge` to pick up later. Never throws — the caller
 * (character removal) must complete the local deletion regardless of whether
 * the remote side succeeded.
 */
export async function purgeCharacterRemoteDataOrDefer(characterId: number): Promise<boolean> {
  try {
    await purgeCharacterRemoteData(characterId);
    await clearPending(characterId);
    return true;
  } catch {
    await markPending(characterId);
    return false;
  }
}

/**
 * Retry a deferred purge for this Character, if one is outstanding. Called at
 * the top of every sync (`planSync.syncCharacter`) — a single `db.settings`
 * read and a no-op the moment nothing is pending. Never throws: a sync must
 * not fail because a purge deferred by an earlier removal is still stuck
 * (offline, still-dead token).
 */
export async function retryPendingRemotePurge(characterId: number): Promise<void> {
  if (!(await isPending(characterId))) return;
  try {
    await purgeCharacterRemoteData(characterId);
    await clearPending(characterId);
  } catch {
    // Still can't purge; stays pending for the next authentication.
  }
}
