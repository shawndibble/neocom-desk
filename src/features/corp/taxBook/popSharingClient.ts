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
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callRouted } from '@/sync/routedCallable';
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

/** Whether a Community the settings name carries the book's pops (#6223). */
export interface PopSharingCommunityStatus {
  /** An officer of the book (an editing use in the last 30 days) is a Member there. */
  officer: boolean;
  /** The Community's admin blocked this corporation. */
  blocked: boolean;
}

/** For each Community the book's settings name: does it carry the pops now, and if not why. */
export async function readPopSharingCommunities(
  characterId: number,
  corporationId: number
): Promise<Record<string, PopSharingCommunityStatus>> {
  await ensureSignedIn(characterId);
  const accessToken = await getValidAccessToken(characterId).catch(() => undefined);
  const result = await callRouted<
    { corporationId: number; accessToken?: string },
    { communities?: Record<string, PopSharingCommunityStatus> }
  >(
    'getCorpTaxBookPopSharingCommunitiesCallable',
    { corporationId, ...(accessToken ? { accessToken } : {}) },
    characterId
  );
  return result.communities ?? {};
}
