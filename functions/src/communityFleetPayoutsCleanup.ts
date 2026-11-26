import type { Firestore } from 'firebase-admin/firestore';
import { COMMUNITIES_COLLECTION } from './communities.js';
import {
  FLEET_PAYOUTS_COLLECTION,
  FLEET_PAYOUT_EXPIRED_RETENTION_MS,
  decideFleetPayoutSweep,
} from './communityFleetPayouts.js';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';

export const SWEEP_PAGE_SIZE = 100;
export const SWEEP_MAX_DELETES = 500;

export interface SweepResult {
  deleted: number;
  failed: number;
  truncated: boolean;
}

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
