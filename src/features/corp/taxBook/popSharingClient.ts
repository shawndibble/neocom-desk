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

export interface PopSharingCommunityStatus {
  officer: boolean;
  blocked: boolean;
}

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
