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

export const SWEEP_PAGE_SIZE = 100;
export const SWEEP_MAX_DELETES = 500;

export interface SweepResult {
  deleted: number;
  failed: number;
  truncated: boolean;
}

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
        await boardVersionRef(db, candidate.ref.path.split('/')[1])
          .set(boardVersionBump(true), { merge: true })
          .catch(() => undefined);
      }
    }
  }
  return result;
}

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
