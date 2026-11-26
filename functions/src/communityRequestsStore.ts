import type { Caller } from './actorAuth.js';
import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { decideMailRelease, utcDayKey } from './communities.js';
import {
  REQUESTS_COLLECTION,
  MAX_REQUEST_MAILS_PER_DAY,
  decideRequestMail,
  decidePledgeMail,
  characterIdOfUid,
  pledgedLineCount,
  REQUEST_LIFETIME_MS,
  MAX_OPEN_REQUESTS_PER_MEMBER,
  decideEdit,
  decideExtend,
  sameLineSlots,
  PLEDGES_COLLECTION,
  boardVersionBump,
  boardVersionRef,
  type EditRequestInput,
  decidePost,
  decideSetClosed,
  isOpenRequest,
  nextExpiry,
  type PostRequestInput,
  type OwnerActionDecision,
} from './communityRequests.js';
import { communityRef, loadCommunity, memberRef, requireMember } from './communitiesStore.js';

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
    case 'lines-locked':
      throw new HttpsError(
        'failed-precondition',
        'Members have Pledged on this Request, so its items cannot change, only their quantities and specs',
        { reason: 'lines-locked' }
      );
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

async function requireBuyerMember(
  tx: Transaction,
  db: Firestore,
  communityId: string,
  buyerCharacterId: number | undefined
): Promise<void> {
  if (buyerCharacterId === undefined) return;
  const buyer = await tx.get(memberRef(db, communityId, `char:${buyerCharacterId}`));
  if (!buyer.exists) {
    throw new HttpsError('failed-precondition', 'The buyer Character is not a Member', {
      reason: 'buyer-not-member',
    });
  }
}

function standingFields(standing: NonNullable<PostRequestInput['standing']>) {
  return {
    standing: true,
    rate: standing.rate,
    rateBasis: standing.rateBasis,
    hubId: standing.hubId,
    buyerCharacterId: standing.buyerCharacterId ?? null,
    buyLines: standing.buyLines,
  };
}

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
      {
        closed: entry.get('closed') === true,
        expiresAt: Number(entry.get('expiresAt') ?? 0),
        standing: entry.get('standing') === true,
      },
      now
    )
  ).length;
}

export async function postRequest(
  db: Firestore,
  caller: Caller,
  input: PostRequestInput,
  now = Date.now()
): Promise<{ requestId: string }> {
  const ref = requestCollection(db, input.communityId).doc();
  await db.runTransaction(async (tx) => {
    const { characterName } = await requireMember(tx, db, input.communityId, caller);
    const decision = decidePost(await countOpen(tx, db, input.communityId, caller.uid, now));
    if (decision !== 'ok') failRequestDecision(decision);
    await requireBuyerMember(tx, db, input.communityId, input.standing?.buyerCharacterId);
    tx.set(ref, {
      ownerUid: caller.uid,
      ownerHash: caller.ownerHash,
      ownerName: characterName,
      location: input.location,
      terms: input.terms,
      lines: input.lines,
      notify: input.notify,
      createdAt: now,
      lastActivityAt: now,
      closed: false,
      ...(input.standing
        ? standingFields(input.standing)
        : { expiresAt: now + REQUEST_LIFETIME_MS }),
    });
    tx.set(boardVersionRef(db, input.communityId), boardVersionBump(), { merge: true });
  });
  return { requestId: ref.id };
}

export async function editRequest(
  db: Firestore,
  caller: Caller,
  input: EditRequestInput,
  now = Date.now()
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, input.communityId, caller);
    const ref = requestCollection(db, input.communityId).doc(input.requestId);
    const snap = await tx.get(ref);
    const pledges = snap.exists ? await tx.get(ref.collection(PLEDGES_COLLECTION).limit(1)) : null;
    const decision = decideEdit({
      exists: snap.exists,
      ownerUid: snap.exists ? String(snap.get('ownerUid')) : null,
      callerUid: caller.uid,
      closed: snap.get('closed') === true,
      hasPledges: snap.get('standing') !== true && pledges !== null && !pledges.empty,
      slotsKept: sameLineSlots(
        (snap.get('lines') as { typeId: number; kind: string }[] | undefined) ?? [],
        input.lines
      ),
    });
    if (decision !== 'ok') failRequestDecision(decision);
    if ((snap.get('standing') === true) !== (input.standing !== undefined)) {
      throw new HttpsError(
        'failed-precondition',
        'A Request cannot change between standing and not',
        {
          reason: 'standing-locked',
        }
      );
    }
    await requireBuyerMember(tx, db, input.communityId, input.standing?.buyerCharacterId);
    tx.update(ref, {
      location: input.location,
      terms: input.terms,
      ...(input.standing ? standingFields(input.standing) : { lines: input.lines }),
      ...(input.notify ? { notify: input.notify } : {}),
      lastActivityAt: now,
    });
    tx.set(boardVersionRef(db, input.communityId), boardVersionBump(), { merge: true });
  });
}

export async function extendRequest(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string,
  now = Date.now()
): Promise<{ expiresAt: number }> {
  return db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const ref = requestCollection(db, communityId).doc(requestId);
    const snap = await tx.get(ref);
    if (snap.get('standing') === true) {
      throw new HttpsError('failed-precondition', 'A standing Request never expires', {
        reason: 'standing',
      });
    }
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
    tx.set(boardVersionRef(db, communityId), boardVersionBump(), { merge: true });
    return { expiresAt };
  });
}

export async function setRequestClosed(
  db: Firestore,
  caller: Caller,
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
        ...(snap.get('standing') === true ? {} : { expiresAt: now + REQUEST_LIFETIME_MS }),
      });
    }
    tx.set(boardVersionRef(db, communityId), boardVersionBump(), { merge: true });
  });
}

const PLEDGE_MAILS_COLLECTION = 'pledgeMails';
const REQUEST_MAIL_QUOTA_COLLECTION = 'requestMailQuota';
const pledgeMailRef = (db: Firestore, communityId: string, requestId: string, pledgerUid: string) =>
  requestCollection(db, communityId)
    .doc(requestId)
    .collection(PLEDGE_MAILS_COLLECTION)
    .doc(pledgerUid);
const requestMailQuotaRef = (db: Firestore, uid: string, day: string) =>
  db.collection('characters').doc(uid).collection(REQUEST_MAIL_QUOTA_COLLECTION).doc(day);

export interface PledgeMailReservation {
  communityName: string;
  pledgerName: string;
  requesterName: string;
  requesterCharacterId: number;
  remaining: number;
}

function failMail(decision: 'already-mailed' | 'daily-cap'): never {
  if (decision === 'daily-cap') {
    throw new HttpsError('resource-exhausted', 'Daily Request mail limit reached', {
      reason: 'daily-cap',
    });
  }
  throw new HttpsError('already-exists', 'You already mailed the requester about this Request', {
    reason: 'already-mailed',
  });
}

function failPledgeMail(decision: Exclude<ReturnType<typeof decidePledgeMail>, 'ok'>): never {
  switch (decision) {
    case 'not-found':
      throw new HttpsError('not-found', 'Request not found');
    case 'own-request':
      throw new HttpsError('invalid-argument', 'A Request is not mailed to its requester');
    case 'closed':
      throw new HttpsError('failed-precondition', 'That Request is no longer open');
    case 'mail-off':
      throw new HttpsError('failed-precondition', 'The requester did not ask for mail', {
        reason: 'mail-off',
      });
    case 'no-pledge':
      throw new HttpsError('failed-precondition', 'Pledge on the Request first', {
        reason: 'no-pledge',
      });
  }
}

export async function reservePledgeMail(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string,
  now = Date.now()
): Promise<PledgeMailReservation> {
  const community = await loadCommunity(db, communityId);
  const day = utcDayKey(now);
  const quota = requestMailQuotaRef(db, caller.uid, day);
  const mail = pledgeMailRef(db, communityId, requestId, caller.uid);

  const reserved = await db.runTransaction(async (tx) => {
    const { characterName } = await requireMember(tx, db, communityId, caller);
    const requestRef = requestCollection(db, communityId).doc(requestId);
    const request = await tx.get(requestRef);
    const pledge = request.exists
      ? await tx.get(requestRef.collection(PLEDGES_COLLECTION).doc(caller.uid))
      : null;
    const ownerUid = request.exists ? String(request.get('ownerUid')) : null;
    const eligibility = decidePledgeMail({
      exists: request.exists,
      ownerUid,
      callerUid: caller.uid,
      isOpen: isOpenRequest(
        {
          closed: request.get('closed') === true,
          expiresAt: Number(request.get('expiresAt') ?? 0),
          standing: request.get('standing') === true,
        },
        now
      ),
      notifyMail: request.get('notify.mail') === true,
      pledgedLines: pledge?.exists ? pledgedLineCount(pledge.get('lines')) : 0,
    });
    if (eligibility !== 'ok') failPledgeMail(eligibility);
    const requesterCharacterId = characterIdOfUid(String(ownerUid));
    if (
      requesterCharacterId === null ||
      !(await tx.get(memberRef(db, communityId, String(ownerUid)))).exists
    ) {
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
    const who = {
      pledgerName: characterName,
      requesterName: String(request.get('ownerName') ?? ''),
      requesterCharacterId,
    };
    if (decision === 'retake' || decision === 'retake-charged') {
      const attempts = Number(mailSnap.get('attempts') ?? 1) + 1;
      if (decision === 'retake') {
        tx.update(mail, { reservedAt: now, attempts });
        return { ...who, remaining: MAX_REQUEST_MAILS_PER_DAY - dailyCount };
      }
      tx.set(quota, {
        count: dailyCount + 1,
        refunds: Number(quotaSnap.get('refunds') ?? 0),
        ownerHash: caller.ownerHash,
      });
      tx.update(mail, { reservedAt: now, attempts, day });
      return { ...who, remaining: MAX_REQUEST_MAILS_PER_DAY - (dailyCount + 1) };
    }
    if (decision !== 'ok') failMail(decision);
    tx.set(quota, {
      count: dailyCount + 1,
      refunds: Number(quotaSnap.get('refunds') ?? 0),
      ownerHash: caller.ownerHash,
    });
    tx.set(mail, { senderUid: caller.uid, day, reservedAt: now, attempts: 1, sentAt: null });
    return { ...who, remaining: MAX_REQUEST_MAILS_PER_DAY - (dailyCount + 1) };
  });
  return { communityName: String(community.get('name') ?? ''), ...reserved };
}

export async function confirmPledgeMail(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string,
  now = Date.now()
): Promise<void> {
  const mail = pledgeMailRef(db, communityId, requestId, caller.uid);
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const snap = await tx.get(mail);
    if (snap.exists && snap.get('senderUid') === caller.uid) tx.update(mail, { sentAt: now });
  });
}

export async function releasePledgeMail(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string,
  now = Date.now()
): Promise<void> {
  const mail = pledgeMailRef(db, communityId, requestId, caller.uid);
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
