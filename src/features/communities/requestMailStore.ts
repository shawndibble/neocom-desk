/**
 * The server side of Request mail (issue #3810): the day's cap and the
 * one-per-recipient slot are reserved, stamped and released through callables
 * (see `requestMailSend.ts` for the sending itself).
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';

export interface RequestMailTarget {
  communityId: string;
  requestId: string;
  targetCharacterId: number;
  targetName: string;
}

export interface RequestMailReservation {
  communityName: string;
  requesterName: string;
  /** Request mails left today after this one. */
  remaining: number;
}

/** Claims one of the day's Request mails and the one-per-recipient slot; the server holds the cap. */
export function reserveRequestMail(characterId: number, target: RequestMailTarget) {
  return callCommunity<RequestMailTarget, RequestMailReservation>(
    characterId,
    'reserveCommunityRequestMailCallable',
    target
  );
}

/** The mail went out: stamps it. */
export async function confirmRequestMail(
  characterId: number,
  target: RequestMailTarget
): Promise<void> {
  await callCommunity(characterId, 'confirmCommunityRequestMailCallable', target);
}

/** Gives the reserved slot back after a send ESI refused. */
export async function releaseRequestMail(
  characterId: number,
  target: RequestMailTarget
): Promise<void> {
  await callCommunity(characterId, 'releaseCommunityRequestMailCallable', target);
}

/** Request mails this Character has sent today (UTC): a convenience, the server holds the cap. */
export async function loadRequestMailsToday(
  characterId: number,
  now = Date.now()
): Promise<number> {
  const override = communityBackendOverride();
  if (override) return override.loadRequestMailsToday?.() ?? 0;
  const uid = await ensureSignedIn(characterId);
  const day = new Date(now).toISOString().slice(0, 10);
  const snap = await getDoc(doc(getSyncFirestore(), 'characters', uid, 'requestMailQuota', day));
  return Number(snap.exists() ? (snap.data().count ?? 0) : 0);
}
