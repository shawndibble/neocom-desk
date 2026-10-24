// Community Requests cleanup (issue #3812, ADR 0021): the scheduled sweep that
// deletes expired and long-closed Requests with their Pledges, and the admin's
// removal of one Request or one Pledge. Leaving, removal and the stale-account
// purge already delete a Member's Requests and Pledges
// (communitiesStore.deleteMemberShares). The timing decision is the pure
// `decideRequestSweep` in communityRequests.ts.

import type { Caller } from './actorAuth.js';
import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { COMMUNITIES_COLLECTION } from './communities.js';
import {
  CLOSED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  PLEDGES_COLLECTION,
  REQUESTS_COLLECTION,
  decideRequestSweep,
} from './communityRequests.js';
import { communityRef, requireAdmin } from './communitiesStore.js';

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

/** Every document a query matches, one page at a time, ordered by `field`. */
async function* pages(
  base: Query,
  field: string,
  pageSize: number
): AsyncGenerator<QueryDocumentSnapshot[]> {
  let after: QueryDocumentSnapshot | undefined;
  for (;;) {
    let page = base.orderBy(field).limit(pageSize);
    if (after) page = page.startAfter(after);
    const found = (await page.get()).docs;
    if (found.length === 0) return;
    yield found;
    if (found.length < pageSize) return;
    after = found[found.length - 1];
  }
}

/**
 * Deletes every Request expired a week ago and every Request closed a week ago,
 * each with its Pledges. Two single-field queries per Community (no composite
 * index), and each candidate is read again right before its delete, so one the
 * owner extended or reopened in the meantime survives and one already gone is
 * skipped. Bounded per run, idempotent, and one Request failing to delete does
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

  for (const community of await db.collection(COMMUNITIES_COLLECTION).listDocuments()) {
    const board = community.collection(REQUESTS_COLLECTION);
    const seen = new Set<string>();
    const queries: [Query, string][] = [
      [board.where('expiresAt', '<=', now - EXPIRED_RETENTION_MS), 'expiresAt'],
      [board.where('closedAt', '<=', now - CLOSED_RETENTION_MS), 'closedAt'],
    ];
    for (const [query, field] of queries) {
      for await (const page of pages(query, field, pageSize)) {
        for (const candidate of page) {
          if (seen.has(candidate.id)) continue;
          seen.add(candidate.id);
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
          }
        }
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
}
