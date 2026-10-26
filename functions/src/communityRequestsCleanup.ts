// Community Requests cleanup (issue #3812, ADR 0021): the scheduled sweep that
// deletes expired and long-closed Requests with their Pledges, and the admin's
// removal of one Request or one Pledge. Leaving, removal and the stale-account
// purge already delete a Member's Requests and Pledges
// (communitiesStore.deleteMemberShares). The timing decision is the pure
// `decideRequestSweep` in communityRequests.ts.

import type { Caller } from './actorAuth.js';
import type { Firestore } from 'firebase-admin/firestore';
import { COMMUNITIES_COLLECTION } from './communities.js';
import {
  CLOSED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  PLEDGES_COLLECTION,
  REQUESTS_COLLECTION,
  boardVersionBump,
  boardVersionRef,
  decideRequestSweep,
} from './communityRequests.js';
import { communityRef, requireAdmin } from './communitiesStore.js';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';

/** Requests read per query page. */
export const SWEEP_PAGE_SIZE = 100;
/** Requests deleted per run across all Communities; a larger backlog continues on the next tick. */
export const SWEEP_MAX_DELETES = 500;

export interface SweepResult {
  deleted: number;
  /** Requests whose delete failed: left in place, retried next run. */
  failed: number;
  /** The delete cap was reached with more waiting. */
  truncated: boolean;
}

/**
 * Deletes every Request expired a week ago and every Request closed a week ago,
 * each with its Pledges. Two single-field collection-group queries across all
 * Communities (the per-Community scan until their index is deployed; see
 * indexedSweep.ts), and each candidate is read again right before its delete,
 * so one the owner extended or reopened in the meantime survives and one
 * already gone is skipped. The re-read only costs on a Request being deleted,
 * never on an idle run. Bounded per run, idempotent, and one Request failing to delete does
 * not stop the rest.
 */
export async function sweepRequests(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<SweepResult> {
  const maxDeletes = limits.maxDeletes ?? SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? SWEEP_PAGE_SIZE;
  const result: SweepResult = { deleted: 0, failed: 0, truncated: false };

  const seen = new Set<string>();
  const retentionQueries: [field: string, cutoff: number][] = [
    ['expiresAt', now - EXPIRED_RETENTION_MS],
    ['closedAt', now - CLOSED_RETENTION_MS],
  ];
  for (const [field, cutoff] of retentionQueries) {
    async function* perCommunity() {
      for (const community of await db.collection(COMMUNITIES_COLLECTION).listDocuments()) {
        const board = community.collection(REQUESTS_COLLECTION);
        yield* pages(board.where(field, '<=', cutoff), field, pageSize);
      }
    }
    const group = db.collectionGroup(REQUESTS_COLLECTION).where(field, '<=', cutoff);
    for await (const page of indexedPages(group, perCommunity, {
      field,
      pageSize,
      label: 'sweepCommunityRequests',
    })) {
      for (const candidate of page) {
        if (!isTopLevelChild(candidate, COMMUNITIES_COLLECTION)) continue;
        if (seen.has(candidate.ref.path)) continue;
        seen.add(candidate.ref.path);
        const fresh = await candidate.ref.get();
        if (!fresh.exists) continue;
        const verdict = decideRequestSweep(
          {
            closed: fresh.get('closed') === true,
            closedAt: typeof fresh.get('closedAt') === 'number' ? fresh.get('closedAt') : null,
            expiresAt: Number(fresh.get('expiresAt')),
            standing: fresh.get('standing') === true,
          },
          now
        );
        if (verdict !== 'delete') continue;
        if (result.deleted >= maxDeletes) {
          result.truncated = true;
          return result;
        }
        try {
          await db.recursiveDelete(fresh.ref);
          result.deleted += 1;
        } catch {
          result.failed += 1;
          continue;
        }
        // The delete stands even if the stamp fails; a cached board then ages out on its own.
        await boardVersionRef(db, candidate.ref.path.split('/')[1])
          .set(boardVersionBump(true), { merge: true })
          .catch(() => undefined);
      }
    }
  }
  return result;
}

/** The admin removes any Request, with all its Pledges. Removing one already gone is not an error. */
export async function removeRequest(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string
): Promise<void> {
  await requireAdmin(db, communityId, caller);
  await db.recursiveDelete(
    communityRef(db, communityId).collection(REQUESTS_COLLECTION).doc(requestId)
  );
  await boardVersionRef(db, communityId).set(boardVersionBump(true), { merge: true });
}

/** The admin removes one Member's Pledge on a Request; the Request and the other Pledges stay. */
export async function removePledge(
  db: Firestore,
  caller: Caller,
  communityId: string,
  requestId: string,
  pledgeUid: string
): Promise<void> {
  await requireAdmin(db, communityId, caller);
  await communityRef(db, communityId)
    .collection(REQUESTS_COLLECTION)
    .doc(requestId)
    .collection(PLEDGES_COLLECTION)
    .doc(pledgeUid)
    .delete();
  await boardVersionRef(db, communityId).set(boardVersionBump(true), { merge: true });
}
