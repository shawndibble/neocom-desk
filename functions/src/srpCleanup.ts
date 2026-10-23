// SRP retention sweep (issue #4856, ADR 0026): the scheduled sweep that deletes Paid and
// Rejected SRP Claims one year after they close, leaving a one-line srpAudit record per
// claim. Timing is the pure `decideSrpClaimSweep` in srpRetention.ts.

import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_AUDIT, SRP_CLAIMS } from './srpTypes.js';
import { SRP_RETENTION_MS, decideSrpClaimSweep } from './srpRetention.js';

/** Claims read per query page. */
export const SRP_SWEEP_PAGE_SIZE = 100;
/** Claims deleted per run across all corps; a larger backlog continues on the next tick. */
export const SRP_SWEEP_MAX_DELETES = 500;

export interface SrpSweepResult {
  deleted: number;
  /** Claims whose delete failed: left in place, retried next run. */
  failed: number;
  /** The delete cap was reached with more waiting. */
  truncated: boolean;
}

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

/** `char:123` -> 123; anything else null. The only pilot identifier the audit line keeps. */
function characterIdOf(uid: unknown): number | null {
  const id = typeof uid === 'string' ? Number(/^char:(\d+)$/.exec(uid)?.[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Deletes every Paid or Rejected claim closed a year ago, with a one-line audit record
 * (claim id, state, closed date, deleted date, character id). Each claim is decided again
 * inside the transaction that deletes it, so a claim re-filed meanwhile is kept, and the
 * delete and its audit line land together. Bounded per run, idempotent (a deleted claim is
 * gone, and the audit id is fixed per claim), and one failing claim does not stop the rest.
 */
export async function sweepSrpClaims(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<SrpSweepResult> {
  const maxDeletes = limits.maxDeletes ?? SRP_SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? SRP_SWEEP_PAGE_SIZE;
  const result: SrpSweepResult = { deleted: 0, failed: 0, truncated: false };

  for (const corp of await db.collection(CORPS_COLLECTION).listDocuments()) {
    try {
      const query = corp.collection(SRP_CLAIMS).where('closedAt', '<=', now - SRP_RETENTION_MS);
      for await (const page of pages(query, 'closedAt', pageSize)) {
        for (const candidate of page) {
          if (decideSrpClaimSweep(candidate.data(), now) !== 'delete') continue;
          if (result.deleted >= maxDeletes) {
            result.truncated = true;
            return result;
          }
          try {
            const done = await db.runTransaction(async (tx) => {
              const fresh = await tx.get(candidate.ref);
              if (!fresh.exists || decideSrpClaimSweep(fresh.data() ?? {}, now) !== 'delete') {
                return false;
              }
              tx.delete(fresh.ref);
              tx.set(
                corp
                  .collection(SRP_AUDIT)
                  .doc(`${String(now).padStart(15, '0')}~sweep-${fresh.id}`),
                {
                  at: now,
                  by: null,
                  byName: 'retention sweep',
                  action: 'retentionDelete',
                  detail: {
                    claimId: fresh.id,
                    state: fresh.get('state'),
                    characterId: characterIdOf(fresh.get('uid')),
                    closedAt: fresh.get('closedAt'),
                    deletedAt: now,
                  },
                }
              );
              return true;
            });
            if (done) result.deleted += 1;
          } catch {
            result.failed += 1;
          }
        }
      }
    } catch {
      // One corp's failing query must not skip the rest; retried next run.
      result.failed += 1;
    }
  }
  return result;
}
