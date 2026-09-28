// Immediate remote purge behind "Delete all data" (Settings → This device,
// features/character/deleteAllCharacterData.ts): every doc a Character owns
// under /characters/{uid}. The only other remote delete is the 90-day
// `purgeStaleAccounts` inactivity purge; removing one Character leaves its
// synced copy to that.
//
// Firestore rules grant `delete` uid-only, unlike `get`/`update`, which also
// require an ownerHash match (see firestore.rules). The parent doc holds only
// the last-synced heartbeat and is not client-deletable; the inactivity purge
// takes it once nothing syncs the Character again.

import { collection, deleteDoc, doc, getDocs, type Firestore } from 'firebase/firestore/lite';
import { getSyncFirestore } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';
import { REMOTE_COLLECTION_NAMES } from './syncedCollections';

async function deleteAllDocs(firestore: Firestore, uid: string, name: string): Promise<void> {
  const col = collection(firestore, 'characters', uid, name);
  const snapshot = await getDocs(col);
  await Promise.all(snapshot.docs.map((d) => deleteDoc(doc(col, d.id))));
}

/**
 * Delete every remote doc one Character owns, across every synced collection.
 * Throws on failure (dead refresh token, offline) — the caller reports it.
 */
export async function purgeCharacterRemoteData(characterId: number): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  for (const name of REMOTE_COLLECTION_NAMES) {
    await deleteAllDocs(firestore, uid, name);
  }
}
