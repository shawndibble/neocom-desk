// Communities (issue #3596): the admin-SDK half of the Community callables.
// Every cap and every delete-on-leave lives here, in one transaction where a
// count is involved, because Firestore rules can't enforce either. The pure
// decisions are in communities.ts; this file only reads, decides and writes.
//
// Layout (see firestore.rules):
//   communities/{id}                              name, adminUid, inviteCode, memberCount, createdAt
//   communities/{id}/members/{uid}                ownerHash, characterName, joinedAt, admittedFrom? (+ client-written pushedAt/libraryHash/chunkCount)
//   communities/{id}/members/{uid}/library/{n}    chunk of Shared Blueprints, written by the Member
//   communities/{id}/fittings/{uid~key}           one shared Fitting (issue #3605), written by the Member
//   characters/{uid}/communities/{id}             the Character's membership index

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
  REQUESTS_COLLECTION as ITEM_REQUESTS_COLLECTION,
} from './communityRequests.js';

import { FLEET_PAYOUTS_COLLECTION } from './communityFleetPayouts.js';
import { ADMITTED_FROM_REQUEST } from './communityPush.js';

const LIBRARY_COLLECTION = 'library';
const REQUESTS_COLLECTION = 'requests';
const FITTINGS_COLLECTION = 'fittings';
const SKILL_PLANS_COLLECTION = 'skillPlans';

export const communityRef = (db: Firestore, communityId: string) =>
  db.collection(COMMUNITIES_COLLECTION).doc(communityId);
export const memberRef = (db: Firestore, communityId: string, uid: string) =>
  communityRef(db, communityId).collection(COMMUNITY_MEMBERS_COLLECTION).doc(uid);
/** A Character waiting for the admin to let them in (a Community that approves new Members). */
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
      // `details.reason` lets the join page tell the two caps apart without parsing prose.
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

/**
 * A Member doc counts for the caller only under the ownerHash it was joined
 * with: a sold Character keeps its uid but gets a new ownerHash, and must not
 * act on, or be told it holds, the previous owner's membership.
 */
export async function isCurrentMember(db: Firestore, communityId: string, caller: Caller) {
  const member = await memberRef(db, communityId, caller.uid).get();
  return member.exists && member.get('ownerHash') === caller.ownerHash;
}

export async function requireAdmin(db: Firestore, communityId: string, caller: Caller) {
  const snap = await loadCommunity(db, communityId);
  if (snap.get('adminUid') !== caller.uid || !(await isCurrentMember(db, communityId, caller))) {
    fail('not-admin');
  }
  return snap;
}

/**
 * Drops index entries whose Community no longer exists (a join that raced a
 * delete), so they can't count against the 10-Communities cap forever.
 */
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

/**
 * What the invite page shows before sign-in: name, admin and Member count.
 * Callable without a session, so it returns only these three public facts —
 * never the invite code, the admin's uid or any Member beyond the admin's name.
 * An unknown or revoked code is the same not-found a join gives.
 */
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
    // Re-read inside the transaction: the invite may have been revoked, or
    // the last seat taken, since the lookup above.
    const community = await tx.get(ref);
    const member = await tx.get(memberRef(db, ref.id, caller.uid));
    const joined = await tx.get(
      indexCollection(db, caller.uid).limit(MAX_COMMUNITIES_PER_CHARACTER)
    );
    // The admin mailing this Character an invite is the approval already, once.
    const mailed = await tx.get(mailInvite);
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
      // Idempotent: asking again refreshes the one waiting request.
      tx.set(requestRef(db, ref.id, caller.uid), {
        ownerHash: caller.ownerHash,
        characterName: input.characterName,
        requestedAt: Date.now(),
      });
      return { communityId: ref.id, alreadyMember: false, pending: true };
    }
    if (decision !== 'ok') fail(decision);

    admit(tx, db, ref, caller.uid, {
      ownerHash: caller.ownerHash,
      characterName: input.characterName,
    });
    tx.delete(requestRef(db, ref.id, caller.uid));
    if (preApproved) tx.update(mailInvite, { consumedAt: Date.now() });
    return { communityId: ref.id, alreadyMember: false };
  });
}

/** A Character's id from its Firebase uid `char:{id}`. */
function characterIdOf(uid: string): number {
  return Number(uid.slice('char:'.length));
}

/**
 * Before a Character becomes a Member: a Member doc under another ownerHash is
 * the previous owner of a sold Character, whose shared data goes. Chunks left
 * by any earlier crashed removal are cleared too, since they would be readable
 * again the moment the new Member doc exists.
 */
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

/** Writes the Member, the Character's index entry and the count: the one place a Member is made. */
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
    // The Member-joined push skips a Member the admin let in themselves (issue #5121).
    ...(admittedFrom ? { admittedFrom } : {}),
  });
  tx.set(indexCollection(db, uid).doc(community.id), {
    ownerHash: who.ownerHash,
    communityId: community.id,
    joinedAt: now,
  });
  tx.update(community, { memberCount: FieldValue.increment(1) });
}

/** The admin turns "approve new Members" on or off. Requests already waiting stay until decided. */
export async function setRequireApproval(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requireApproval: boolean
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  await community.ref.update({ requireApproval });
}

/**
 * The admin accepts or declines one waiting request. Accepting makes the
 * Character a Member under the same caps as a join; a cap that stops it is
 * reported and the request stays. Declining just removes the request. Both are
 * safe to repeat: a request already gone is not an error.
 */
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
  // A Member already holds this Character: the request is stale (the Character
  // was sold, or it joined another way). Drop it; never evict the Member.
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

/**
 * Queues the deletion of one Member's Pledge on every Request of a Community
 * (the Pledge doc id is the Pledger's uid; deleting one that does not exist is
 * harmless). Returns the delete promises so the caller can await them.
 */
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

/**
 * Everything one Member shared into a Community: their blueprint library
 * chunks, their shared Fittings (issue #3605), their shared Skill Plans and
 * their Requests with the Pledges under them, and their Fleet Payouts with Shares. Every delete-on-leave path goes
 * through this so a new kind of shared data can't be missed in one.
 */
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
  // Requests (ADR 0021): a Member's own, with the Pledges under them.
  const posted = await communityRef(db, communityId)
    .collection(ITEM_REQUESTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  for (const request of posted.docs) await db.recursiveDelete(request.ref);
  // Fleet Payouts (#4779): a Member's own, with their Shares. Other bosses' Payouts keep a left Member's Share.
  const payouts = await communityRef(db, communityId)
    .collection(FLEET_PAYOUTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  for (const payout of payouts.docs) await db.recursiveDelete(payout.ref);
  // Their Pledges on other Members' Requests (the doc id is the Pledger's uid).
  const writer = db.bulkWriter();
  const pledgeDeletes = await queuePledgeDeletes(db, writer, communityId, uid);
  // Awaited, so a delete that fails after its retries fails the leave rather than orphaning a readable copy.
  const deletes = [
    ...pledgeDeletes,
    ...[...fittings.docs, ...plans.docs].map((shared) => writer.delete(shared.ref)),
  ];
  await writer.close();
  await Promise.all(deletes);
}

/**
 * Deletes one Member's shared data and membership. The Member doc, index doc
 * and count go first, in one transaction: with the Member doc gone the rules
 * stop the Member writing another chunk, so the library sweep after it can't
 * race a rewrite. A crash between the two leaves chunks no one can read;
 * joinCommunity clears them before the Member can return. Safe to re-run,
 * and safe when the Community is already gone.
 */
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
  // One transaction, so the heir can't leave between the check and the
  // hand-over and strand the Community with an admin who is not a Member.
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
  /** Mail invites left today after this one. */
  remaining: number;
}

/**
 * Claims one of the admin's daily mail invites and the one-per-target slot
 * before the client sends the mail (the refresh token never leaves the device,
 * so the client must send it). The cap lives here, in one transaction, not in
 * the UI. A revoked link has nothing to mail: not-found.
 */
// NOTE: functions/src/communityRequestsStore.ts (reserveRequestMail and its confirm/release)
// mirrors this reserve/confirm/release on purpose, with its own cap and collections. Keep the
// refund and retake rules in step; they were not merged to leave the invite path untouched.
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
      // A crashed tab left this reserved: let the admin try again, at no extra cost.
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

/** The mail went out: stamp the time the admin's "Sent" list shows. */
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

/**
 * The send definitely failed: give back the slot and the day's count. Idempotent
 * and bounded (see `decideMailRelease`): a fresh, unconfirmed reservation of this
 * admin's, a few times a day.
 */
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
    // Past the window, or out of refunds, the slot stays spent: the server
    // can't tell a failed send from a skipped confirm.
    if (decision !== 'refund') return;
    tx.delete(invite);
    if (quotaSnap.exists) {
      const count = Number(quotaSnap.get('count') ?? 0);
      tx.update(quota, { count: Math.max(0, count - 1), refunds: refundsToday + 1 });
    }
  });
}

/** Revoking leaves no working link until the admin regenerates one. */
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

/**
 * Removes every Member's data and index doc, then the Community itself. The
 * invite is revoked first so no join lands mid-delete, and the admin's own
 * index doc goes last: if this crashes part-way, the admin's purge or retry
 * still finds the Community to finish it.
 */
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

/**
 * purgeStaleAccounts hook (ADR 0018): before a stale Character's synced data
 * goes, remove it from every Community it is in. A stale admin takes the
 * Community with it — v1 has no co-admin or transfer, so an adminless
 * Community could never be moderated or deleted.
 */
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
