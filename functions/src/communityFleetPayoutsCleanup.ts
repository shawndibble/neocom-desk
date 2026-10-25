// Community Fleet Payouts cleanup (issue #4779): the scheduled sweep that
// deletes Fleet Payouts a week after they expired, with their Shares. Leaving,
// removal and the stale-account purge delete a Member's own Fleet Payouts
// (communitiesStore.deleteMemberShares). Timing is the pure
// `decideFleetPayoutSweep` in communityFleetPayouts.ts.

import type { Firestore } from 'firebase-admin/firestore';
import { COMMUNITIES_COLLECTION } from './communities.js';
import {
  FLEET_PAYOUTS_COLLECTION,
  FLEET_PAYOUT_EXPIRED_RETENTION_MS,
  decideFleetPayoutSweep,
} from './communityFleetPayouts.js';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';

/** Fleet Payouts read per query page. */
export const SWEEP_PAGE_SIZE = 100;
/** Fleet Payouts deleted per run across all Communities; a larger backlog continues on the next tick. */
export const SWEEP_MAX_DELETES = 500;

export interface SweepResult {
  deleted: number;
  /** Fleet Payouts whose delete failed: left in place, retried next run. */
  failed: number;
  /** The delete cap was reached with more waiting. */
  truncated: boolean;
}

/**
 * Deletes every Fleet Payout expired a week ago, with its Shares. One
 * collection-group query across all Communities (the per-Community scan until
 * its index is deployed; see indexedSweep.ts). Each candidate is read again
 * right before its delete, so one extended meanwhile survives. Bounded per run,
 * idempotent, and one failing delete does not stop the rest.
 */
export async function sweepFleetPayouts(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<SweepResult> {
  const maxDeletes = limits.maxDeletes ?? SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? SWEEP_PAGE_SIZE;
  const result: SweepResult = { deleted: 0, failed: 0, truncated: false };

  const cutoff = now - FLEET_PAYOUT_EXPIRED_RETENTION_MS;
  async function* perCommunity() {
    for (const community of await db.collection(COMMUNITIES_COLLECTION).listDocuments()) {
      const query = community.collection(FLEET_PAYOUTS_COLLECTION).where('expiresAt', '<=', cutoff);
      yield* pages(query, 'expiresAt', pageSize);
    }
  }
  const group = db.collectionGroup(FLEET_PAYOUTS_COLLECTION).where('expiresAt', '<=', cutoff);
  for await (const page of indexedPages(group, perCommunity, {
    field: 'expiresAt',
    pageSize,
    label: 'sweepCommunityFleetPayouts',
  })) {
    for (const candidate of page) {
      if (!isTopLevelChild(candidate, COMMUNITIES_COLLECTION)) continue;
      const fresh = await candidate.ref.get();
      if (!fresh.exists) continue;
      if (decideFleetPayoutSweep({ expiresAt: Number(fresh.get('expiresAt')) }, now) !== 'delete') {
        continue;
      }
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
  return result;
}
