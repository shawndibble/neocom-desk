import type { DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';
import { CORPS_COLLECTION } from './srpTypes.js';
import { warn as logWarn } from 'firebase-functions/logger';
import { pruneRaw } from './vettingRawStore.js';
import { decideVettingSweep, requestExpiry } from './vettingDecide.js';
import {
  VETTING_INPUTS,
  VETTING_REVIEWS,
  VETTING_THROTTLE,
  type StoredVettingReview,
} from './vettingTypes.js';
import { DAY_MS } from './timeConstants.js';

export const VETTING_SWEEP_PAGE_SIZE = 100;
export const VETTING_SWEEP_MAX_DELETES = 500;

export interface VettingSweepResult {
  deleted: number;
  cleared: number;
  throttles: number;
  failed: number;
  truncated: boolean;
}

export const VETTING_THROTTLE_KEEP_MS = 2 * DAY_MS;

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
          if (done !== 'keep') {
            try {
              await pruneRaw(candidate.ref);
            } catch (err) {
              result.failed += 1;
              logWarn('vetting raw rows not pruned', {
                reason: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } catch {
          result.failed += 1;
        }
      }
    }
  } catch {
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
