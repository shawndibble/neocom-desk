// Community Requests (issue #3807, ADR 0021): the admin-SDK half of the post,
// extend and close/reopen callables. Layout (see firestore.rules):
//   communities/{id}/itemRequests/{requestId}               a Request (this file)
//   communities/{id}/itemRequests/{requestId}/pledges/{uid} one Member's Pledges (issue #3808)
// Callers are checked against the Member doc, the requester's display name is
// read from it (never trusted from the client), and the open-Requests cap is
// counted inside the same transaction as the write.

import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  REQUESTS_COLLECTION,
  REQUEST_LIFETIME_MS,
  MAX_OPEN_REQUESTS_PER_MEMBER,
  decideExtend,
  decidePost,
  decideSetClosed,
  isOpenRequest,
  nextExpiry,
  type PostRequestInput,
  type OwnerActionDecision,
} from './communityRequests.js';
import { communityRef, memberRef, type CallerCharacter } from './communitiesStore.js';

const requestCollection = (db: Firestore, communityId: string) =>
  communityRef(db, communityId).collection(REQUESTS_COLLECTION);

function failOwnerAction(decision: OwnerActionDecision): never {
  switch (decision) {
    case 'not-found':
      throw new HttpsError('not-found', 'Request not found');
    case 'not-owner':
      throw new HttpsError('permission-denied', 'Only the requester can do this');
    case 'closed':
      throw new HttpsError('failed-precondition', 'Reopen the Request first');
    case 'too-many-open-requests':
      throw new HttpsError(
        'resource-exhausted',
        `A Member can have at most ${MAX_OPEN_REQUESTS_PER_MEMBER} open Requests`,
        { reason: 'too-many-open-requests' }
      );
    default:
      throw new HttpsError('internal', decision);
  }
}

/** The caller's Member doc, only under the ownerHash it was joined with (a sold Character does not inherit it). */
async function requireMember(
  tx: Transaction,
  db: Firestore,
  communityId: string,
  caller: CallerCharacter
): Promise<{ characterName: string }> {
  const member = await tx.get(memberRef(db, communityId, caller.uid));
  if (!member.exists || member.get('ownerHash') !== caller.ownerHash) {
    throw new HttpsError('not-found', 'Not a Member of this Community');
  }
  return { characterName: String(member.get('characterName') ?? '') };
}

/** How many Requests this Member has open: not closed, not past expiry. */
async function countOpen(
  tx: Transaction,
  db: Firestore,
  communityId: string,
  uid: string,
  now: number
): Promise<number> {
  const mine = await tx.get(requestCollection(db, communityId).where('ownerUid', '==', uid));
  return mine.docs.filter((entry) =>
    isOpenRequest(
      { closed: entry.get('closed') === true, expiresAt: Number(entry.get('expiresAt') ?? 0) },
      now
    )
  ).length;
}

/** Posts a Request. Returns its id; the client refetches the board. */
export async function postRequest(
  db: Firestore,
  caller: CallerCharacter,
  input: PostRequestInput,
  now = Date.now()
): Promise<{ requestId: string }> {
  const ref = requestCollection(db, input.communityId).doc();
  await db.runTransaction(async (tx) => {
    const { characterName } = await requireMember(tx, db, input.communityId, caller);
    const decision = decidePost(await countOpen(tx, db, input.communityId, caller.uid, now));
    if (decision !== 'ok') failOwnerAction(decision);
    tx.set(ref, {
      ownerUid: caller.uid,
      ownerHash: caller.ownerHash,
      ownerName: characterName,
      location: input.location,
      terms: input.terms,
      lines: input.lines,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + REQUEST_LIFETIME_MS,
      closed: false,
    });
  });
  return { requestId: ref.id };
}

/** The requester restarts the 30-day clock on an open Request. */
export async function extendRequest(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  requestId: string,
  now = Date.now()
): Promise<{ expiresAt: number }> {
  return db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const ref = requestCollection(db, communityId).doc(requestId);
    const snap = await tx.get(ref);
    const decision = decideExtend({
      exists: snap.exists,
      ownerUid: snap.exists ? String(snap.get('ownerUid')) : null,
      callerUid: caller.uid,
      closed: snap.get('closed') === true,
    });
    if (decision !== 'ok') failOwnerAction(decision);
    const expiresAt = nextExpiry(now, Number(snap.get('expiresAt') ?? 0));
    tx.update(ref, { expiresAt, lastActivityAt: now });
    return { expiresAt };
  });
}

/**
 * The requester closes a Request, or reopens a closed one (a reopen restarts
 * the 30 days and counts against the open cap). A closed Request is deleted a
 * week later by the cleanup ticket.
 */
export async function setRequestClosed(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  requestId: string,
  closed: boolean,
  now = Date.now()
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const ref = requestCollection(db, communityId).doc(requestId);
    const snap = await tx.get(ref);
    const wasClosed = snap.get('closed') === true;
    const decision = decideSetClosed({
      exists: snap.exists,
      ownerUid: snap.exists ? String(snap.get('ownerUid')) : null,
      callerUid: caller.uid,
      closed: wasClosed,
      wantClosed: closed,
      openCount: wasClosed && !closed ? await countOpen(tx, db, communityId, caller.uid, now) : 0,
    });
    if (decision !== 'ok') failOwnerAction(decision);
    if (closed === wasClosed) return;
    if (closed) {
      tx.update(ref, { closed: true, closedAt: now, lastActivityAt: now });
    } else {
      tx.update(ref, {
        closed: false,
        closedAt: null,
        lastActivityAt: now,
        expiresAt: now + REQUEST_LIFETIME_MS,
      });
    }
  });
}
