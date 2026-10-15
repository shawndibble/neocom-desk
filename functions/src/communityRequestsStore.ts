// Community Requests (issue #3807, ADR 0021): the admin-SDK half of the post,
// extend and close/reopen callables. Layout (see firestore.rules):
//   communities/{id}/itemRequests/{requestId}               a Request (this file)
//   communities/{id}/itemRequests/{requestId}/pledges/{uid} one Member's Pledges (issue #3808)
// Callers are checked against the Member doc, the requester's display name is
// read from it (never trusted from the client), and the open-Requests cap is
// counted inside the same transaction as the write.

import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { decideMailRelease, utcDayKey } from './communities.js';
import {
  REQUESTS_COLLECTION,
  MAX_REQUEST_MAILS_PER_DAY,
  decideRequestMail,
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
import {
  communityRef,
  loadCommunity,
  memberRef,
  type CallerCharacter,
} from './communitiesStore.js';

const requestCollection = (db: Firestore, communityId: string) =>
  communityRef(db, communityId).collection(REQUESTS_COLLECTION);

function failRequestDecision(decision: OwnerActionDecision): never {
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
    if (decision !== 'ok') failRequestDecision(decision);
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
    const expiry = Number(snap.get('expiresAt') ?? 0);
    const isOpen = snap.exists && snap.get('closed') !== true && expiry > now;
    const decision = decideExtend({
      exists: snap.exists,
      ownerUid: snap.exists ? String(snap.get('ownerUid')) : null,
      callerUid: caller.uid,
      closed: snap.get('closed') === true,
      isOpen,
      openCount: isOpen ? 0 : await countOpen(tx, db, communityId, caller.uid, now),
    });
    if (decision !== 'ok') failRequestDecision(decision);
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
    if (decision !== 'ok') failRequestDecision(decision);
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

// Request mail (issue #3810): the client sends the in-game mail with its own
// token, so the 100-a-day cap, the one-per-recipient rule and the "sent" stamp
// live in reserve/confirm/release, the same shape as the mail invites'.
//   communities/{id}/itemRequests/{requestId}/mails/{targetCharacterId}  one recipient's slot
//   characters/{uid}/requestMailQuota/{day}                              the sender's count for the day
const MAILS_COLLECTION = 'mails';
const REQUEST_MAIL_QUOTA_COLLECTION = 'requestMailQuota';
const requestMailRef = (db: Firestore, communityId: string, requestId: string, target: number) =>
  requestCollection(db, communityId)
    .doc(requestId)
    .collection(MAILS_COLLECTION)
    .doc(String(target));
const requestMailQuotaRef = (db: Firestore, uid: string, day: string) =>
  db.collection('characters').doc(uid).collection(REQUEST_MAIL_QUOTA_COLLECTION).doc(day);

export interface RequestMailReservation {
  communityName: string;
  /** The requester's name as the Member doc has it (never trusted from the client). */
  requesterName: string;
  /** Request mails left today after this one. */
  remaining: number;
}

function failMail(decision: 'already-mailed' | 'daily-cap'): never {
  if (decision === 'daily-cap') {
    throw new HttpsError('resource-exhausted', 'Daily Request mail limit reached', {
      reason: 'daily-cap',
    });
  }
  throw new HttpsError('already-exists', 'This Member was already mailed about this Request', {
    reason: 'already-mailed',
  });
}

/**
 * Claims one of the requester's daily Request mails and the one-per-recipient
 * slot before the client sends it. Only the requester, on their own open
 * Request, to another Member of the same Community (a Request mail is never a
 * way to message an arbitrary Character). The cap is counted here, in one
 * transaction.
 */
export async function reserveRequestMail(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  requestId: string,
  targetCharacterId: number,
  targetName: string,
  now = Date.now()
): Promise<RequestMailReservation> {
  const community = await loadCommunity(db, communityId);
  const day = utcDayKey(now);
  const quota = requestMailQuotaRef(db, caller.uid, day);
  const mail = requestMailRef(db, communityId, requestId, targetCharacterId);
  const targetUid = `char:${targetCharacterId}`;
  if (targetUid === caller.uid) {
    throw new HttpsError('invalid-argument', 'A Request is not mailed to its requester');
  }

  const { remaining, requesterName } = await db.runTransaction(async (tx) => {
    const { characterName } = await requireMember(tx, db, communityId, caller);
    const request = await tx.get(requestCollection(db, communityId).doc(requestId));
    if (!request.exists || request.get('ownerUid') !== caller.uid) {
      throw new HttpsError('not-found', 'Request not found');
    }
    if (
      !isOpenRequest(
        {
          closed: request.get('closed') === true,
          expiresAt: Number(request.get('expiresAt') ?? 0),
        },
        now
      )
    ) {
      throw new HttpsError('failed-precondition', 'That Request is no longer open');
    }
    if (!(await tx.get(memberRef(db, communityId, targetUid))).exists) {
      throw new HttpsError('not-found', 'Not a Member of this Community');
    }
    const quotaSnap = await tx.get(quota);
    const mailSnap = await tx.get(mail);
    const dailyCount = Number(quotaSnap.get('count') ?? 0);
    const decision = decideRequestMail({
      dailyCount,
      existing: mailSnap.exists
        ? {
            sentAt: typeof mailSnap.get('sentAt') === 'number' ? mailSnap.get('sentAt') : null,
            reservedAt: Number(mailSnap.get('reservedAt') ?? 0),
            attempts: Number(mailSnap.get('attempts') ?? 1),
            day: typeof mailSnap.get('day') === 'string' ? mailSnap.get('day') : undefined,
          }
        : null,
      now,
      day,
    });
    if (decision === 'retake' || decision === 'retake-charged') {
      // A crashed tab left this reserved: let the requester try again. On the same day it costs
      // nothing; after midnight today's count pays, and the slot moves to today so a release
      // refunds today's count.
      const attempts = Number(mailSnap.get('attempts') ?? 1) + 1;
      if (decision === 'retake') {
        tx.update(mail, { reservedAt: now, attempts });
        return { remaining: MAX_REQUEST_MAILS_PER_DAY - dailyCount, requesterName: characterName };
      }
      tx.set(quota, {
        count: dailyCount + 1,
        refunds: Number(quotaSnap.get('refunds') ?? 0),
        ownerHash: caller.ownerHash,
      });
      tx.update(mail, { reservedAt: now, attempts, day });
      return {
        remaining: MAX_REQUEST_MAILS_PER_DAY - (dailyCount + 1),
        requesterName: characterName,
      };
    }
    if (decision !== 'ok') failMail(decision);
    tx.set(quota, {
      count: dailyCount + 1,
      refunds: Number(quotaSnap.get('refunds') ?? 0),
      ownerHash: caller.ownerHash,
    });
    tx.set(mail, {
      senderUid: caller.uid,
      targetName,
      day,
      reservedAt: now,
      attempts: 1,
      sentAt: null,
    });
    return {
      remaining: MAX_REQUEST_MAILS_PER_DAY - (dailyCount + 1),
      requesterName: characterName,
    };
  });
  return { communityName: String(community.get('name') ?? ''), requesterName, remaining };
}

/** The mail went out: stamp the time. */
export async function confirmRequestMail(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  requestId: string,
  targetCharacterId: number,
  now = Date.now()
): Promise<void> {
  const mail = requestMailRef(db, communityId, requestId, targetCharacterId);
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const snap = await tx.get(mail);
    if (snap.exists && snap.get('senderUid') === caller.uid) tx.update(mail, { sentAt: now });
  });
}

/**
 * The send definitely failed: give back the slot and the day's count. The same
 * rules as the mail invites (`decideMailRelease`): a fresh, unconfirmed
 * reservation of this sender's, a few times a day.
 */
export async function releaseRequestMail(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  requestId: string,
  targetCharacterId: number,
  now = Date.now()
): Promise<void> {
  const mail = requestMailRef(db, communityId, requestId, targetCharacterId);
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const snap = await tx.get(mail);
    if (!snap.exists || snap.get('senderUid') !== caller.uid) return;
    const quota = requestMailQuotaRef(db, caller.uid, String(snap.get('day')));
    const quotaSnap = await tx.get(quota);
    const refundsToday = Number(quotaSnap.get('refunds') ?? 0);
    const decision = decideMailRelease({
      existing: {
        sentAt: typeof snap.get('sentAt') === 'number' ? snap.get('sentAt') : null,
        reservedAt: Number(snap.get('reservedAt') ?? 0),
        attempts: Number(snap.get('attempts') ?? 1),
      },
      refundsToday,
      now,
    });
    if (decision !== 'refund') return;
    tx.delete(mail);
    if (quotaSnap.exists) {
      const count = Number(quotaSnap.get('count') ?? 0);
      tx.update(quota, { count: Math.max(0, count - 1), refunds: refundsToday + 1 });
    }
  });
}
