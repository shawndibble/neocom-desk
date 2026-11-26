import type { Caller } from './actorAuth.js';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  CHARACTER_COMMUNITIES_COLLECTION,
  COMMUNITIES_COLLECTION,
  COMMUNITY_MEMBERS_COLLECTION,
  MAX_COMMUNITIES_PER_CHARACTER,
  decideCreate,
  decideJoin,
  decideLeave,
  decideMailInvite,
  decideMailRelease,
  utcDayKey,
  MAX_MAIL_INVITES_PER_DAY,
  decideRemoveMember,
  decideAdmit,
  isPreApproved,
  decideTransferAdmin,
  newInviteCode,
  type CreateCommunityInput,
  type JoinCommunityInput,
} from './communities.js';
import {
  PLEDGES_COLLECTION,
  boardVersionBump,
  boardVersionRef,
  REQUESTS_COLLECTION as ITEM_REQUESTS_COLLECTION,
} from './communityRequests.js';

import { FLEET_PAYOUTS_COLLECTION } from './communityFleetPayouts.js';
import { ADMITTED_FROM_REQUEST } from './communityPush.js';

const LIBRARY_COLLECTION = 'library';
export const JOIN_REQUESTS_COLLECTION = 'requests';
const REQUESTS_COLLECTION = JOIN_REQUESTS_COLLECTION;
const FITTINGS_COLLECTION = 'fittings';
const SKILL_PLANS_COLLECTION = 'skillPlans';

export const communityRef = (db: Firestore, communityId: string) =>
  db.collection(COMMUNITIES_COLLECTION).doc(communityId);
export const memberRef = (db: Firestore, communityId: string, uid: string) =>
  communityRef(db, communityId).collection(COMMUNITY_MEMBERS_COLLECTION).doc(uid);
const requestRef = (db: Firestore, communityId: string, uid: string) =>
  communityRef(db, communityId).collection(REQUESTS_COLLECTION).doc(uid);
const indexCollection = (db: Firestore, uid: string) =>
  db.collection('characters').doc(uid).collection(CHARACTER_COMMUNITIES_COLLECTION);

export function fail(decision: string): never {
  switch (decision) {
    case 'too-many-communities':
      throw new HttpsError(
        'resource-exhausted',
        `A Character can belong to at most ${MAX_COMMUNITIES_PER_CHARACTER} Communities`,
        { reason: 'too-many-communities' }
      );
    case 'already-invited':
      throw new HttpsError('already-exists', 'This Character was already sent an invite', {
        reason: 'already-invited',
      });
    case 'daily-cap':
      throw new HttpsError('resource-exhausted', 'Daily mail invite limit reached', {
        reason: 'daily-cap',
      });
    case 'community-full':
      throw new HttpsError('resource-exhausted', 'This Community is full', {
        reason: 'community-full',
      });
    case 'invalid-invite':
      throw new HttpsError('not-found', 'Invite link is not valid');
    case 'not-admin':
      throw new HttpsError('permission-denied', 'Only the Community admin can do this');
    case 'not-a-member':
      throw new HttpsError('not-found', 'Not a Member of this Community');
    case 'admin-cannot-leave':
    case 'cannot-remove-admin':
      throw new HttpsError('failed-precondition', 'The admin must delete the Community instead');
    default:
      throw new HttpsError('internal', decision);
  }
}

export async function loadCommunity(db: Firestore, communityId: string) {
  const snap = await communityRef(db, communityId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Community not found');
  return snap;
}

export async function isCurrentMember(db: Firestore, communityId: string, caller: Caller) {
  const member = await memberRef(db, communityId, caller.uid).get();
  return member.exists && member.get('ownerHash') === caller.ownerHash;
}

const notAMember = () => new HttpsError('not-found', 'Not a Member of this Community');

export async function requireCurrentMember(db: Firestore, communityId: string, caller: Caller) {
  if (!(await isCurrentMember(db, communityId, caller))) throw notAMember();
}

export async function requireMember(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  communityId: string,
  caller: Caller
): Promise<{ characterName: string }> {
  const member = await tx.get(memberRef(db, communityId, caller.uid));
  if (!member.exists || member.get('ownerHash') !== caller.ownerHash) throw notAMember();
  return { characterName: String(member.get('characterName') ?? '') };
}

export async function requireAdmin(db: Firestore, communityId: string, caller: Caller) {
  const snap = await loadCommunity(db, communityId);
  if (snap.get('adminUid') !== caller.uid || !(await isCurrentMember(db, communityId, caller))) {
    fail('not-admin');
  }
  return snap;
}

async function pruneDanglingIndex(db: Firestore, uid: string): Promise<void> {
  for (const entry of (await indexCollection(db, uid).limit(MAX_COMMUNITIES_PER_CHARACTER).get())
    .docs) {
    if (!(await communityRef(db, entry.id).get()).exists) await entry.ref.delete();
  }
}

export interface InvitePreview {
  name: string;
  adminName: string;
  memberCount: number;
}

export async function previewCommunity(db: Firestore, inviteCode: string): Promise<InvitePreview> {
  const found = await db
    .collection(COMMUNITIES_COLLECTION)
    .where('inviteCode', '==', inviteCode)
    .limit(1)
    .get();
  if (found.empty) fail('invalid-invite');
  const community = found.docs[0];
  const admin = await memberRef(db, community.id, community.get('adminUid')).get();
  return {
    name: String(community.get('name') ?? ''),
    adminName: String(admin.get('characterName') ?? ''),
    memberCount: Number(community.get('memberCount') ?? 0),
  };
}

export async function createCommunity(
  db: Firestore,
  caller: Caller,
  input: CreateCommunityInput
): Promise<{ communityId: string; inviteCode: string }> {
  await pruneDanglingIndex(db, caller.uid);
  const ref = db.collection(COMMUNITIES_COLLECTION).doc();
  const inviteCode = newInviteCode();
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const joined = await tx.get(
      indexCollection(db, caller.uid).limit(MAX_COMMUNITIES_PER_CHARACTER)
    );
    const decision = decideCreate(joined.size);
    if (decision !== 'ok') fail(decision);
    tx.set(ref, {
      name: input.name,
      adminUid: caller.uid,
      inviteCode,
      memberCount: 1,
      createdAt: now,
    });
    tx.set(memberRef(db, ref.id, caller.uid), {
      ownerHash: caller.ownerHash,
      characterName: input.characterName,
      joinedAt: now,
    });
    tx.set(indexCollection(db, caller.uid).doc(ref.id), {
      ownerHash: caller.ownerHash,
      communityId: ref.id,
      joinedAt: now,
    });
  });
  return { communityId: ref.id, inviteCode };
}

export async function joinCommunity(
  db: Firestore,
  caller: Caller,
  input: JoinCommunityInput
): Promise<{ communityId: string; alreadyMember: boolean; pending?: boolean }> {
  const found = await db
    .collection(COMMUNITIES_COLLECTION)
    .where('inviteCode', '==', input.inviteCode)
    .limit(1)
    .get();
  if (found.empty) fail('invalid-invite');
  const ref = found.docs[0].ref;
  await pruneDanglingIndex(db, caller.uid);
  await clearStaleMemberData(db, ref.id, caller.uid, caller.ownerHash);
  const mailInvite = mailInviteRef(db, ref.id, characterIdOf(caller.uid));

  return db.runTransaction(async (tx) => {
    const community = await tx.get(ref);
    const member = await tx.get(memberRef(db, ref.id, caller.uid));
    const joined = await tx.get(
      indexCollection(db, caller.uid).limit(MAX_COMMUNITIES_PER_CHARACTER)
    );
    const mailed = await tx.get(mailInvite);
    const waiting = await tx.get(requestRef(db, ref.id, caller.uid));
    const preApproved = isPreApproved(
      mailed.exists
        ? {
            adminUid: String(mailed.get('adminUid') ?? ''),
            sentAt: typeof mailed.get('sentAt') === 'number' ? mailed.get('sentAt') : null,
            consumedAt:
              typeof mailed.get('consumedAt') === 'number' ? mailed.get('consumedAt') : null,
          }
        : null,
      String(community.get('adminUid') ?? '')
    );
    const decision = decideJoin({
      inviteMatches: community.exists && community.get('inviteCode') === input.inviteCode,
      alreadyMember: member.exists,
      memberCount: Number(community.get('memberCount') ?? 0),
      joinedCount: joined.size,
      requiresApproval: community.get('requireApproval') === true,
      preApproved,
    });
    if (decision === 'already-member') return { communityId: ref.id, alreadyMember: true };
    if (decision === 'needs-approval') {
      tx.set(requestRef(db, ref.id, caller.uid), {
        ownerHash: caller.ownerHash,
        characterName: input.characterName,
        requestedAt: Date.now(),
      });
      return { communityId: ref.id, alreadyMember: false, pending: true };
    }
    if (decision !== 'ok') fail(decision);

    admit(
      tx,
      db,
      ref,
      caller.uid,
      { ownerHash: caller.ownerHash, characterName: input.characterName },
      waiting.exists ? ADMITTED_FROM_REQUEST : undefined
    );
    tx.delete(requestRef(db, ref.id, caller.uid));
    if (preApproved) tx.update(mailInvite, { consumedAt: Date.now() });
    return { communityId: ref.id, alreadyMember: false };
  });
}

function characterIdOf(uid: string): number {
  return Number(uid.slice('char:'.length));
}

async function clearStaleMemberData(
  db: Firestore,
  communityId: string,
  uid: string,
  ownerHash: string
): Promise<void> {
  const existing = await memberRef(db, communityId, uid).get();
  if (existing.exists && existing.get('ownerHash') !== ownerHash) {
    await removeMemberData(db, communityId, uid);
  } else if (!existing.exists) {
    await deleteMemberShares(db, communityId, uid);
  }
}

function admit(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  community: FirebaseFirestore.DocumentReference,
  uid: string,
  who: { ownerHash: string; characterName: string },
  admittedFrom?: typeof ADMITTED_FROM_REQUEST
): void {
  const now = Date.now();
  tx.set(memberRef(db, community.id, uid), {
    ownerHash: who.ownerHash,
    characterName: who.characterName,
    joinedAt: now,
    ...(admittedFrom ? { admittedFrom } : {}),
  });
  tx.set(indexCollection(db, uid).doc(community.id), {
    ownerHash: who.ownerHash,
    communityId: community.id,
    joinedAt: now,
  });
  tx.update(community, { memberCount: FieldValue.increment(1) });
}

export async function setRequireApproval(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requireApproval: boolean
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  await community.ref.update({ requireApproval });
}

export async function decideJoinRequest(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestUid: string,
  accept: boolean
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  const request = requestRef(db, communityId, requestUid);
  if (!accept) {
    await request.delete();
    return;
  }
  const waiting = await request.get();
  if (!waiting.exists) return;
  if ((await memberRef(db, communityId, requestUid).get()).exists) {
    await request.delete();
    return;
  }
  await pruneDanglingIndex(db, requestUid);
  await deleteMemberShares(db, communityId, requestUid);
  await db.runTransaction(async (tx) => {
    const [current, member, joined, stillWaiting] = await Promise.all([
      tx.get(community.ref),
      tx.get(memberRef(db, communityId, requestUid)),
      tx.get(indexCollection(db, requestUid).limit(MAX_COMMUNITIES_PER_CHARACTER)),
      tx.get(request),
    ]);
    if (!stillWaiting.exists) return;
    const decision = decideAdmit({
      alreadyMember: member.exists,
      memberCount: Number(current.get('memberCount') ?? 0),
      joinedCount: joined.size,
    });
    if (decision === 'already-member') {
      tx.delete(request);
      return;
    }
    if (decision !== 'ok') fail(decision);
    admit(
      tx,
      db,
      community.ref,
      requestUid,
      {
        ownerHash: String(stillWaiting.get('ownerHash')),
        characterName: String(stillWaiting.get('characterName') ?? ''),
      },
      ADMITTED_FROM_REQUEST
    );
    tx.delete(request);
  });
}

export async function queuePledgeDeletes(
  db: Firestore,
  writer: { delete: (ref: FirebaseFirestore.DocumentReference) => Promise<unknown> },
  communityId: string,
  uid: string
): Promise<Promise<unknown>[]> {
  const board = await communityRef(db, communityId)
    .collection(ITEM_REQUESTS_COLLECTION)
    .listDocuments();
  return board.map((request) => writer.delete(request.collection(PLEDGES_COLLECTION).doc(uid)));
}

export async function deleteMemberShares(
  db: Firestore,
  communityId: string,
  uid: string
): Promise<void> {
  await db.recursiveDelete(memberRef(db, communityId, uid).collection(LIBRARY_COLLECTION));
  const fittings = await communityRef(db, communityId)
    .collection(FITTINGS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  const plans = await communityRef(db, communityId)
    .collection(SKILL_PLANS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  const posted = await communityRef(db, communityId)
    .collection(ITEM_REQUESTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  for (const request of posted.docs) await db.recursiveDelete(request.ref);
  const payouts = await communityRef(db, communityId)
    .collection(FLEET_PAYOUTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  for (const payout of payouts.docs) await db.recursiveDelete(payout.ref);
  const writer = db.bulkWriter();
  const pledgeDeletes = await queuePledgeDeletes(db, writer, communityId, uid);
  const deletes = [
    ...pledgeDeletes,
    ...[...fittings.docs, ...plans.docs].map((shared) => writer.delete(shared.ref)),
  ];
  await writer.close();
  await Promise.all(deletes);
  await boardVersionRef(db, communityId).set(boardVersionBump(true), { merge: true });
}

export async function removeMemberData(
  db: Firestore,
  communityId: string,
  uid: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const community = await tx.get(communityRef(db, communityId));
    const member = await tx.get(memberRef(db, communityId, uid));
    if (member.exists) {
      tx.delete(member.ref);
      if (community.exists) tx.update(community.ref, { memberCount: FieldValue.increment(-1) });
    }
    tx.delete(indexCollection(db, uid).doc(communityId));
    tx.delete(requestRef(db, communityId, uid));
  });
  await deleteMemberShares(db, communityId, uid);
}

export async function leaveCommunity(
  db: Firestore,
  caller: Caller,
  communityId: string
): Promise<void> {
  const community = await loadCommunity(db, communityId);
  const decision = decideLeave({
    adminUid: community.get('adminUid'),
    callerUid: caller.uid,
    isMember: await isCurrentMember(db, communityId, caller),
  });
  if (decision !== 'ok') fail(decision);
  await removeMemberData(db, communityId, caller.uid);
}

export async function removeMember(
  db: Firestore,
  caller: Caller,
  communityId: string,
  memberUid: string
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  const member = await memberRef(db, communityId, memberUid).get();
  const decision = decideRemoveMember({
    adminUid: community.get('adminUid'),
    callerUid: caller.uid,
    targetUid: memberUid,
    targetIsMember: member.exists,
  });
  if (decision !== 'ok') fail(decision);
  await removeMemberData(db, communityId, memberUid);
}

export async function transferAdmin(
  db: Firestore,
  caller: Caller,
  communityId: string,
  newAdminUid: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const community = await tx.get(communityRef(db, communityId));
    if (!community.exists) throw new HttpsError('not-found', 'Community not found');
    const callerMember = await tx.get(memberRef(db, communityId, caller.uid));
    const target = await tx.get(memberRef(db, communityId, newAdminUid));
    if (
      community.get('adminUid') !== caller.uid ||
      !callerMember.exists ||
      callerMember.get('ownerHash') !== caller.ownerHash
    ) {
      fail('not-admin');
    }
    const decision = decideTransferAdmin({
      adminUid: community.get('adminUid'),
      callerUid: caller.uid,
      targetUid: newAdminUid,
      targetIsMember: target.exists,
    });
    if (decision === 'already-admin') {
      throw new HttpsError('failed-precondition', 'That Character is already the admin');
    }
    if (decision !== 'ok') fail(decision);
    tx.update(community.ref, { adminUid: newAdminUid });
  });
}

const MAIL_INVITES_COLLECTION = 'mailInvites';
const MAIL_QUOTA_COLLECTION = 'mailInviteQuota';
const mailInviteRef = (db: Firestore, communityId: string, targetCharacterId: number) =>
  communityRef(db, communityId).collection(MAIL_INVITES_COLLECTION).doc(String(targetCharacterId));
const quotaRef = (db: Firestore, uid: string, day: string) =>
  db.collection('characters').doc(uid).collection(MAIL_QUOTA_COLLECTION).doc(day);

export interface MailInviteReservation {
  inviteCode: string;
  communityName: string;
  adminName: string;
  remaining: number;
}

export async function reserveMailInvite(
  db: Firestore,
  caller: Caller,
  communityId: string,
  targetCharacterId: number,
  targetName: string,
  now = Date.now()
): Promise<MailInviteReservation> {
  const community = await requireAdmin(db, communityId, caller);
  const inviteCode = community.get('inviteCode');
  if (typeof inviteCode !== 'string') fail('invalid-invite');
  const admin = await memberRef(db, communityId, caller.uid).get();
  const day = utcDayKey(now);
  const quota = quotaRef(db, caller.uid, day);
  const invite = mailInviteRef(db, communityId, targetCharacterId);

  const remaining = await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quota);
    const inviteSnap = await tx.get(invite);
    const dailyCount = Number(quotaSnap.get('count') ?? 0);
    const decision = decideMailInvite({
      dailyCount,
      existing: inviteSnap.exists
        ? {
            sentAt: typeof inviteSnap.get('sentAt') === 'number' ? inviteSnap.get('sentAt') : null,
            reservedAt: Number(inviteSnap.get('reservedAt') ?? 0),
            attempts: Number(inviteSnap.get('attempts') ?? 1),
          }
        : null,
      now,
    });
    if (decision === 'retake') {
      tx.update(invite, {
        reservedAt: now,
        attempts: Number(inviteSnap.get('attempts') ?? 1) + 1,
      });
      return MAX_MAIL_INVITES_PER_DAY - dailyCount;
    }
    if (decision !== 'ok') fail(decision);
    tx.set(quota, {
      count: dailyCount + 1,
      refunds: Number(quotaSnap.get('refunds') ?? 0),
      ownerHash: caller.ownerHash,
    });
    tx.set(invite, {
      adminUid: caller.uid,
      targetName,
      day,
      reservedAt: now,
      attempts: 1,
      sentAt: null,
    });
    return MAX_MAIL_INVITES_PER_DAY - (dailyCount + 1);
  });
  return {
    inviteCode,
    communityName: String(community.get('name') ?? ''),
    adminName: String(admin.get('characterName') ?? ''),
    remaining,
  };
}

export async function confirmMailInvite(
  db: Firestore,
  caller: Caller,
  communityId: string,
  targetCharacterId: number,
  now = Date.now()
): Promise<void> {
  await requireAdmin(db, communityId, caller);
  const invite = mailInviteRef(db, communityId, targetCharacterId);
  const snap = await invite.get();
  if (snap.exists && snap.get('adminUid') === caller.uid) await invite.update({ sentAt: now });
}

export async function releaseMailInvite(
  db: Firestore,
  caller: Caller,
  communityId: string,
  targetCharacterId: number,
  now = Date.now()
): Promise<void> {
  await requireAdmin(db, communityId, caller);
  const invite = mailInviteRef(db, communityId, targetCharacterId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(invite);
    if (!snap.exists || snap.get('adminUid') !== caller.uid) return;
    const quota = quotaRef(db, caller.uid, String(snap.get('day')));
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
    tx.delete(invite);
    if (quotaSnap.exists) {
      const count = Number(quotaSnap.get('count') ?? 0);
      tx.update(quota, { count: Math.max(0, count - 1), refunds: refundsToday + 1 });
    }
  });
}

export async function revokeInvite(
  db: Firestore,
  caller: Caller,
  communityId: string
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  await community.ref.update({ inviteCode: null });
}

export async function regenerateInvite(
  db: Firestore,
  caller: Caller,
  communityId: string
): Promise<{ inviteCode: string }> {
  const community = await requireAdmin(db, communityId, caller);
  const inviteCode = newInviteCode();
  await community.ref.update({ inviteCode });
  return { inviteCode };
}

export async function deleteCommunityData(
  db: Firestore,
  communityId: string,
  adminUid?: string
): Promise<void> {
  const ref = communityRef(db, communityId);
  if ((await ref.get()).exists) await ref.update({ inviteCode: null });
  for (const member of await ref.collection(COMMUNITY_MEMBERS_COLLECTION).listDocuments()) {
    if (member.id === adminUid) continue;
    await db.recursiveDelete(member.collection(LIBRARY_COLLECTION));
    await indexCollection(db, member.id).doc(communityId).delete();
  }
  if (adminUid) {
    await db.recursiveDelete(memberRef(db, communityId, adminUid).collection(LIBRARY_COLLECTION));
  }
  await db.recursiveDelete(ref);
  if (adminUid) await indexCollection(db, adminUid).doc(communityId).delete();
}

export async function deleteCommunity(
  db: Firestore,
  caller: Caller,
  communityId: string
): Promise<void> {
  await requireAdmin(db, communityId, caller);
  await deleteCommunityData(db, communityId, caller.uid);
}

export async function purgeCharacterCommunities(db: Firestore, uid: string): Promise<void> {
  for (const entry of (await indexCollection(db, uid).get()).docs) {
    const community = await communityRef(db, entry.id).get();
    if (community.exists && community.get('adminUid') === uid) {
      await deleteCommunityData(db, entry.id, uid);
    } else {
      await removeMemberData(db, entry.id, uid);
    }
  }
}
