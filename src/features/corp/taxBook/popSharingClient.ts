/**
 * A book's Pop Sharing settings (issue #6222): `corps/{corp}/meta/popSharing`, which the
 * book's officers read (editors and read-only alike) and only `editCorpTaxBookCallable`'s
 * `setPopSharing` / `setPopSharingMoon` write. A book that never set them reads as sharing off.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import {
  POP_SHARING_DOC,
  popSharingFrom,
  type PopSharingDoc,
} from '../../../../functions/src/popSharing';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';

export async function readPopSharing(
  characterId: number,
  corporationId: number
): Promise<PopSharingDoc> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(
    doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'meta', POP_SHARING_DOC)
  );
  return popSharingFrom(snap.exists() ? snap.data() : undefined);
}
