// Community Fleet Payouts (issue #4779): the admin-SDK half of the create,
// set-paid and remove callables. Layout (see firestore.rules):
//   communities/{id}/fleetPayouts/{payoutId}          a Fleet Payout (this file)
//   communities/{id}/fleetPayouts/{payoutId}/shares/{index}  one pilot's Fleet Share
// The boss's name is read from the Member doc, never trusted from the client;
// the open cap is counted in the same transaction as the write. A share's
// memberUid is set only when the pilot's Character is a current Member.

import type { Caller } from './actorAuth.js';
import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  FLEET_PAYOUTS_COLLECTION,
  FLEET_PAYOUT_LIFETIME_MS,
  FLEET_SHARES_COLLECTION,
  MAX_OPEN_PAYOUTS_PER_MEMBER,
  decideCreate,
  decideOwnerAction,
  isOpenPayout,
  type CreateFleetPayoutInput,
  type CreateDecision,
} from './communityFleetPayouts.js';
import { communityRef, loadCommunity, memberRef } from './communitiesStore.js';

export const fleetPayoutCollection = (db: Firestore, communityId: string) =>
  communityRef(db, communityId).collection(FLEET_PAYOUTS_COLLECTION);

function failCreate(decision: Exclude<CreateDecision, 'ok'>): never {
  switch (decision) {
    case 'shares-exceed-total':
      throw new HttpsError(
        'invalid-argument',
        'The shares add up to more than the pile after the hold-back',
        { reason: 'shares-exceed-total' }
      );
    case 'duplicate-pilot':
      throw new HttpsError('invalid-argument', 'A pilot is listed twice', {
        reason: 'duplicate-pilot',
      });
    case 'too-many-open-payouts':
      throw new HttpsError(
        'resource-exhausted',
        `A Member can have at most ${MAX_OPEN_PAYOUTS_PER_MEMBER} open Fleet Payouts`,
        { reason: 'too-many-open-payouts' }
      );
  }
}

/** The caller's Member doc, only under the ownerHash it was joined with (a sold Character does not inherit it). */
async function requireMember(
  tx: Transaction,
  db: Firestore,
  communityId: string,
  caller: Caller
): Promise<{ characterName: string }> {
  const member = await tx.get(memberRef(db, communityId, caller.uid));
  if (!member.exists || member.get('ownerHash') !== caller.ownerHash) {
    throw new HttpsError('not-found', 'Not a Member of this Community');
  }
  return { characterName: String(member.get('characterName') ?? '') };
}

/** Opens a Fleet Payout with its Shares. Returns its id; the client refetches. */
export async function createFleetPayout(
  db: Firestore,
  caller: Caller,
  input: CreateFleetPayoutInput,
  now = Date.now()
): Promise<{ payoutId: string }> {
  const ref = fleetPayoutCollection(db, input.communityId).doc();
  await db.runTransaction(async (tx) => {
    const { characterName } = await requireMember(tx, db, input.communityId, caller);
    const mine = await tx.get(
      fleetPayoutCollection(db, input.communityId).where('ownerUid', '==', caller.uid)
    );
    const openCount = mine.docs.filter((entry) =>
      isOpenPayout({ expiresAt: Number(entry.get('expiresAt') ?? 0) }, now)
    ).length;
    const decision = decideCreate(input, openCount);
    if (decision !== 'ok') failCreate(decision);

    // Link each pilot to a Member: char:<id> that is a current Member, else null.
    const memberRefs = input.shares.map((s) =>
      s.characterId === null ? null : memberRef(db, input.communityId, `char:${s.characterId}`)
    );
    const present = memberRefs.filter((r): r is NonNullable<typeof r> => r !== null);
    const snaps = present.length > 0 ? await tx.getAll(...present) : [];
    const memberUids = new Set(snaps.filter((s) => s.exists).map((s) => s.id));

    const linked = input.shares.map((s) => {
      const uid = s.characterId === null ? null : `char:${s.characterId}`;
      return uid !== null && memberUids.has(uid) ? uid : null;
    });
    tx.set(ref, {
      ownerUid: caller.uid,
      ownerName: characterName,
      name: input.name,
      totalIsk: input.totalIsk,
      holdBackPct: input.holdBackPct,
      rule: input.rule,
      memberUids: linked.filter((uid): uid is string => uid !== null),
      shareCount: input.shares.length,
      paidCount: 0,
      createdAt: now,
      expiresAt: now + FLEET_PAYOUT_LIFETIME_MS,
    });
    input.shares.forEach((s, i) => {
      tx.set(ref.collection(FLEET_SHARES_COLLECTION).doc(String(i)), {
        pilotName: s.pilotName,
        characterId: s.characterId,
        memberUid: linked[i],
        weight: s.weight,
        isk: s.isk,
        paid: false,
        paidAt: 0,
      });
    });
  });
  return { payoutId: ref.id };
}

/** The boss marks one Share paid or unpaid. Keeps `paidCount` in step; no change is a no-op. */
export async function setFleetShareDone(
  db: Firestore,
  caller: Caller,
  communityId: string,
  payoutId: string,
  shareId: string,
  paid: boolean,
  now = Date.now()
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await requireMember(tx, db, communityId, caller);
    const payoutRef = fleetPayoutCollection(db, communityId).doc(payoutId);
    const payout = await tx.get(payoutRef);
    const decision = decideOwnerAction({
      exists: payout.exists,
      ownerUid: payout.exists ? String(payout.get('ownerUid')) : null,
      callerUid: caller.uid,
    });
    if (decision === 'not-found') throw new HttpsError('not-found', 'Fleet Payout not found');
    if (decision === 'not-owner') {
      throw new HttpsError('permission-denied', 'Only the fleet boss can do this');
    }
    const shareRef = payoutRef.collection(FLEET_SHARES_COLLECTION).doc(shareId);
    const share = await tx.get(shareRef);
    if (!share.exists) throw new HttpsError('not-found', 'Fleet Share not found');
    if ((share.get('paid') === true) === paid) return;
    const paidCount = Number(payout.get('paidCount') ?? 0) + (paid ? 1 : -1);
    tx.update(shareRef, { paid, paidAt: paid ? now : 0 });
    tx.update(payoutRef, { paidCount: Math.max(0, paidCount) });
  });
}

/** The boss or the Community's admin removes a Fleet Payout with its Shares. Already gone is not an error. */
export async function removeFleetPayout(
  db: Firestore,
  caller: Caller,
  communityId: string,
  payoutId: string
): Promise<void> {
  const community = await loadCommunity(db, communityId);
  const member = await memberRef(db, communityId, caller.uid).get();
  if (!member.exists || member.get('ownerHash') !== caller.ownerHash) {
    throw new HttpsError('not-found', 'Not a Member of this Community');
  }
  const ref = fleetPayoutCollection(db, communityId).doc(payoutId);
  const payout = await ref.get();
  if (!payout.exists) return;
  if (payout.get('ownerUid') !== caller.uid && community.get('adminUid') !== caller.uid) {
    throw new HttpsError('permission-denied', 'Only the fleet boss or the admin can do this');
  }
  await db.recursiveDelete(ref);
}
