// Vetting retention sweep: deletes drafts never shared (`VETTING_DRAFT_HOURS`), requests never
// answered or declined (30 days), shared reviews nobody decided (`VETTING_OPEN_KEEP_DAYS`) and
// decided reviews past `deleteAt`, each with whatever was read into it; and clears what a member
// read into a request and left unsent for a day. Which of those applies is `decideVettingSweep`
// (vettingDecide.ts); every review carries the time the sweep next acts on it in `expiresAt`.
// It also deletes the draft throttle's counters once their day is long over.

import type { DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';
import { CORPS_COLLECTION } from './srpTypes.js';
import { decideVettingSweep, requestExpiry } from './vettingDecide.js';
import {
  DAY_MS,
  VETTING_INPUTS,
  VETTING_REVIEWS,
  VETTING_THROTTLE,
  type StoredVettingReview,
} from './vettingTypes.js';

export const VETTING_SWEEP_PAGE_SIZE = 100;
/** Reviews deleted per run across all corps; a larger backlog continues on the next tick. */
export const VETTING_SWEEP_MAX_DELETES = 500;

export interface VettingSweepResult {
  deleted: number;
  /** Requests kept, with what was read into them removed. */
  cleared: number;
  /** Draft-throttle counters deleted: their one-day window ended more than a day ago. */
  throttles: number;
  /** Reviews (or pages of counters) whose delete failed: left in place, retried next run. */
  failed: number;
  /** A delete cap was reached with more waiting. */
  truncated: boolean;
}

/**
 * A throttle counter is stale this long after its window began: the window is a day
 * (`nextDraftSlot`), and it is kept one more so the sweep never races a live count.
 */
export const VETTING_THROTTLE_KEEP_MS = 2 * DAY_MS;

/**
 * One collection-group query across all corps (the per-corp scan until its index is deployed;
 * see indexedSweep.ts), so an idle run is one read. Each review is decided again in its own
 * transaction, so one shared or answered meanwhile is kept. Bounded per run, idempotent, and
 * one failing review does not stop the rest. The throttle counters are swept the same way, a
 * page per batch, under the same cap.
 */
export async function sweepVetting(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<VettingSweepResult> {
  const maxDeletes = limits.maxDeletes ?? VETTING_SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? VETTING_SWEEP_PAGE_SIZE;
  const result: VettingSweepResult = {
    deleted: 0,
    cleared: 0,
    throttles: 0,
    failed: 0,
    truncated: false,
  };

  /** Pages of one subcollection's documents whose `field` is at or before `bound`, all corps. */
  function due(
    group: Query,
    under: (corp: DocumentReference) => Query,
    field: string,
    bound: number,
    label: string
  ) {
    const past = (query: Query) => query.where(field, '<=', bound);
    async function* perCorp() {
      for (const corp of await db.collection(CORPS_COLLECTION).listDocuments()) {
        try {
          yield* pages(past(under(corp)), field, pageSize);
        } catch {
          // One corp's failing query must not skip the rest; retried next run.
          result.failed += 1;
        }
      }
    }
    return indexedPages(past(group), perCorp, { field, pageSize, label });
  }
  const reviews = due(
    db.collectionGroup(VETTING_REVIEWS),
    (corp) => corp.collection(VETTING_REVIEWS),
    'expiresAt',
    now,
    'sweepVetting'
  );
  const throttles = due(
    db.collectionGroup(VETTING_THROTTLE),
    (corp) => corp.collection(VETTING_THROTTLE),
    'windowStart',
    now - VETTING_THROTTLE_KEEP_MS,
    'sweepVettingThrottle'
  );

  try {
    sweep: for await (const page of reviews) {
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

  try {
    for await (const page of throttles) {
      const found = page.filter((doc) => isTopLevelChild(doc, CORPS_COLLECTION));
      if (found.length === 0) continue;
      if (result.throttles + found.length > maxDeletes) {
        result.truncated = true;
        break;
      }
      try {
        const batch = db.batch();
        for (const doc of found) batch.delete(doc.ref);
        await batch.commit();
        result.throttles += found.length;
      } catch {
        result.failed += 1;
      }
    }
  } catch {
    result.failed += 1;
  }
  return result;
}
