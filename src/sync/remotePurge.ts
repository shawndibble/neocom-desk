import { collection, deleteDoc, doc, getDocs, type Firestore } from 'firebase/firestore/lite';
import { getSyncFirestore } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';
import { REMOTE_COLLECTION_NAMES } from './syncedCollections';

async function deleteAllDocs(firestore: Firestore, uid: string, name: string): Promise<void> {
  const col = collection(firestore, 'characters', uid, name);
  const snapshot = await getDocs(col);
  await Promise.all(snapshot.docs.map((d) => deleteDoc(doc(col, d.id))));
}

export async function purgeCharacterRemoteData(characterId: number): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore(characterId);
  for (const name of REMOTE_COLLECTION_NAMES) {
    await deleteAllDocs(firestore, uid, name);
  }
}
