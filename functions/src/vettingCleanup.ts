// Vetting retention sweep: deletes drafts never shared (`VETTING_DRAFT_HOURS`), requests never
// answered or declined (30 days), and decided reviews past `deleteAt`, each with whatever was
// read into it; and clears what a member read into a request and left unsent for a day. Which
// of those applies is `decideVettingSweep` (vettingDecide.ts); every review carries the time the
// sweep next acts on it in `expiresAt`.

import type { Firestore } from 'firebase-admin/firestore';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';
import { CORPS_COLLECTION } from './srpTypes.js';
import { decideVettingSweep, requestExpiry } from './vettingDecide.js';
import { VETTING_INPUTS, VETTING_REVIEWS, type StoredVettingReview } from './vettingTypes.js';

export const VETTING_SWEEP_PAGE_SIZE = 100;
/** Reviews deleted per run across all corps; a larger backlog continues on the next tick. */
export const VETTING_SWEEP_MAX_DELETES = 500;

export interface VettingSweepResult {
  deleted: number;
  /** Requests kept, with what was read into them removed. */
  cleared: number;
  /** Reviews whose delete failed: left in place, retried next run. */
  failed: number;
  /** The delete cap was reached with more waiting. */
  truncated: boolean;
}

/**
 * One collection-group query across all corps (the per-corp scan until its index is deployed;
 * see indexedSweep.ts), so an idle run is one read. Each review is decided again in its own
 * transaction, so one shared or answered meanwhile is kept. Bounded per run, idempotent, and
 * one failing review does not stop the rest.
 */
export async function sweepVetting(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<VettingSweepResult> {
  const maxDeletes = limits.maxDeletes ?? VETTING_SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? VETTING_SWEEP_PAGE_SIZE;
  const result: VettingSweepResult = { deleted: 0, cleared: 0, failed: 0, truncated: false };

  async function* perCorp() {
    for (const corp of await db.collection(CORPS_COLLECTION).listDocuments()) {
      try {
        yield* pages(
          corp.collection(VETTING_REVIEWS).where('expiresAt', '<=', now),
          'expiresAt',
          pageSize
        );
      } catch {
        // One corp's failing query must not skip the rest; retried next run.
        result.failed += 1;
      }
    }
  }

  const group = db.collectionGroup(VETTING_REVIEWS).where('expiresAt', '<=', now);
  try {
    sweep: for await (const page of indexedPages(group, perCorp, {
      field: 'expiresAt',
      pageSize,
      label: 'sweepVetting',
    })) {
      for (const candidate of page) {
        if (!isTopLevelChild(candidate, CORPS_COLLECTION)) continue;
        if (decideVettingSweep(candidate.data(), now) === 'keep') continue;
        if (result.deleted >= maxDeletes) {
          result.truncated = true;
          break sweep;
        }
        try {
          // Decided again inside the transaction: a draft shared meanwhile is kept.
          const done = await db.runTransaction(async (tx) => {
            const fresh = (await tx.get(candidate.ref)).data() as StoredVettingReview | undefined;
            const action = fresh ? decideVettingSweep(fresh, now) : 'keep';
            if (!fresh || action === 'keep') return 'keep';
            const held = await tx.get(candidate.ref.collection(VETTING_INPUTS));
            for (const doc of held.docs) tx.delete(doc.ref);
            if (action === 'delete') {
              tx.delete(candidate.ref);
            } else {
              tx.update(candidate.ref, {
                characters: [],
                expiresAt: requestExpiry(fresh.createdAt),
              });
            }
            return action;
          });
          if (done === 'delete') result.deleted += 1;
          if (done === 'clear-inputs') result.cleared += 1;
        } catch {
          result.failed += 1;
        }
      }
    }
  } catch {
    // The collection-group query itself failed (not a missing index): retried next run.
    result.failed += 1;
  }
  return result;
}
