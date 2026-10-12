// Communities (issue #3596): the admin-SDK half of the Community callables.
// Every cap and every delete-on-leave lives here, in one transaction where a
// count is involved, because Firestore rules can't enforce either. The pure
// decisions are in communities.ts; this file only reads, decides and writes.
//
// Layout (see firestore.rules):
//   communities/{id}                              name, adminUid, inviteCode, memberCount, createdAt
//   communities/{id}/members/{uid}                ownerHash, characterName, joinedAt (+ client-written pushedAt/libraryHash/chunkCount)
//   communities/{id}/members/{uid}/library/{n}    chunk of Shared Blueprints, written by the Member
//   characters/{uid}/communities/{id}             the Character's membership index

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
  decideRemoveMember,
  newInviteCode,
  type CreateCommunityInput,
  type JoinCommunityInput,
} from './communities.js';

const LIBRARY_COLLECTION = 'library';

/** Who is calling: the Firebase uid `char:{id}` and the ownerHash claim. */
export interface CallerCharacter {
  uid: string;
  ownerHash: string;
}

const communityRef = (db: Firestore, communityId: string) =>
  db.collection(COMMUNITIES_COLLECTION).doc(communityId);
const memberRef = (db: Firestore, communityId: string, uid: string) =>
  communityRef(db, communityId).collection(COMMUNITY_MEMBERS_COLLECTION).doc(uid);
const indexCollection = (db: Firestore, uid: string) =>
  db.collection('characters').doc(uid).collection(CHARACTER_COMMUNITIES_COLLECTION);

function fail(decision: string): never {
  switch (decision) {
    case 'too-many-communities':
      throw new HttpsError(
        'resource-exhausted',
        `A Character can belong to at most ${MAX_COMMUNITIES_PER_CHARACTER} Communities`
      );
    case 'community-full':
      throw new HttpsError('resource-exhausted', 'This Community is full');
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

async function loadCommunity(db: Firestore, communityId: string) {
  const snap = await communityRef(db, communityId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Community not found');
  return snap;
}

async function requireAdmin(db: Firestore, communityId: string, callerUid: string) {
  const snap = await loadCommunity(db, communityId);
  if (snap.get('adminUid') !== callerUid) fail('not-admin');
  return snap;
}

export async function createCommunity(
  db: Firestore,
  caller: CallerCharacter,
  input: CreateCommunityInput
): Promise<{ communityId: string; inviteCode: string }> {
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
  caller: CallerCharacter,
  input: JoinCommunityInput
): Promise<{ communityId: string; alreadyMember: boolean }> {
  const found = await db
    .collection(COMMUNITIES_COLLECTION)
    .where('inviteCode', '==', input.inviteCode)
    .limit(1)
    .get();
  if (found.empty) fail('invalid-invite');
  const ref = found.docs[0].ref;

  return db.runTransaction(async (tx) => {
    // Re-read inside the transaction: the invite may have been revoked, or
    // the last seat taken, since the lookup above.
    const community = await tx.get(ref);
    const member = await tx.get(memberRef(db, ref.id, caller.uid));
    const joined = await tx.get(
      indexCollection(db, caller.uid).limit(MAX_COMMUNITIES_PER_CHARACTER)
    );
    const decision = decideJoin({
      inviteMatches: community.exists && community.get('inviteCode') === input.inviteCode,
      alreadyMember: member.exists,
      memberCount: Number(community.get('memberCount') ?? 0),
      joinedCount: joined.size,
    });
    if (decision === 'already-member') return { communityId: ref.id, alreadyMember: true };
    if (decision !== 'ok') fail(decision);

    const now = Date.now();
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
    tx.update(ref, { memberCount: FieldValue.increment(1) });
    return { communityId: ref.id, alreadyMember: false };
  });
}

/**
 * Deletes one Member's shared data and membership, in this order: library
 * chunks first, so a crash part-way can never leave readable chunks behind a
 * rejoin; then the Member doc, the index doc and the count, in one
 * transaction. Safe to re-run, and safe when the Community is already gone.
 */
export async function removeMemberData(
  db: Firestore,
  communityId: string,
  uid: string
): Promise<void> {
  await db.recursiveDelete(memberRef(db, communityId, uid).collection(LIBRARY_COLLECTION));
  await db.runTransaction(async (tx) => {
    const community = await tx.get(communityRef(db, communityId));
    const member = await tx.get(memberRef(db, communityId, uid));
    if (member.exists) {
      tx.delete(member.ref);
      if (community.exists) tx.update(community.ref, { memberCount: FieldValue.increment(-1) });
    }
    tx.delete(indexCollection(db, uid).doc(communityId));
  });
}

export async function leaveCommunity(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string
): Promise<void> {
  const community = await loadCommunity(db, communityId);
  const member = await memberRef(db, communityId, caller.uid).get();
  const decision = decideLeave({
    adminUid: community.get('adminUid'),
    callerUid: caller.uid,
    isMember: member.exists,
  });
  if (decision !== 'ok') fail(decision);
  await removeMemberData(db, communityId, caller.uid);
}

export async function removeMember(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string,
  memberUid: string
): Promise<void> {
  const community = await loadCommunity(db, communityId);
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

/** Revoking leaves no working link until the admin regenerates one. */
export async function revokeInvite(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller.uid);
  await community.ref.update({ inviteCode: null });
}

export async function regenerateInvite(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string
): Promise<{ inviteCode: string }> {
  const community = await requireAdmin(db, communityId, caller.uid);
  const inviteCode = newInviteCode();
  await community.ref.update({ inviteCode });
  return { inviteCode };
}

/** Removes every Member's data and index doc, then the Community itself. */
export async function deleteCommunityData(db: Firestore, communityId: string): Promise<void> {
  const ref = communityRef(db, communityId);
  for (const member of await ref.collection(COMMUNITY_MEMBERS_COLLECTION).listDocuments()) {
    await db.recursiveDelete(member.collection(LIBRARY_COLLECTION));
    await indexCollection(db, member.id).doc(communityId).delete();
  }
  await db.recursiveDelete(ref);
}

export async function deleteCommunity(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string
): Promise<void> {
  await requireAdmin(db, communityId, caller.uid);
  await deleteCommunityData(db, communityId);
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
      await deleteCommunityData(db, entry.id);
    } else {
      await removeMemberData(db, entry.id, uid);
    }
  }
}
