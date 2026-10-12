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

/**
 * A Member doc counts for the caller only under the ownerHash it was joined
 * with: a sold Character keeps its uid but gets a new ownerHash, and must not
 * act on, or be told it holds, the previous owner's membership.
 */
async function isCurrentMember(db: Firestore, communityId: string, caller: CallerCharacter) {
  const member = await memberRef(db, communityId, caller.uid).get();
  return member.exists && member.get('ownerHash') === caller.ownerHash;
}

async function requireAdmin(db: Firestore, communityId: string, caller: CallerCharacter) {
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

export async function createCommunity(
  db: Firestore,
  caller: CallerCharacter,
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
  await pruneDanglingIndex(db, caller.uid);
  // A Member doc under another ownerHash is the previous owner of a sold
  // Character: their shared data goes, and this Character joins fresh. Chunks
  // left by any earlier crashed removal are cleared too, since they would be
  // readable again the moment this Member doc exists.
  const existing = await memberRef(db, ref.id, caller.uid).get();
  if (existing.exists && existing.get('ownerHash') !== caller.ownerHash) {
    await removeMemberData(db, ref.id, caller.uid);
  } else if (!existing.exists) {
    await db.recursiveDelete(memberRef(db, ref.id, caller.uid).collection(LIBRARY_COLLECTION));
  }

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
  });
  await db.recursiveDelete(memberRef(db, communityId, uid).collection(LIBRARY_COLLECTION));
}

export async function leaveCommunity(
  db: Firestore,
  caller: CallerCharacter,
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
  caller: CallerCharacter,
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

/** Revoking leaves no working link until the admin regenerates one. */
export async function revokeInvite(
  db: Firestore,
  caller: CallerCharacter,
  communityId: string
): Promise<void> {
  const community = await requireAdmin(db, communityId, caller);
  await community.ref.update({ inviteCode: null });
}

export async function regenerateInvite(
  db: Firestore,
  caller: CallerCharacter,
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
  caller: CallerCharacter,
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
