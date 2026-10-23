// SRP retention sweep (issue #4856, ADR 0026): the scheduled sweep that deletes Paid and
// Rejected SRP Claims one year after they close, leaving one srpAudit entry per corporation
// per run (claim ids only). Timing is the pure `decideSrpClaimSweep` in srpRetention.ts.

import type {
  DocumentReference,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
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

/** Claim ids one audit entry lists; a run that deletes more writes more entries. */
export const SRP_AUDIT_MAX_CLAIM_IDS = 200;

/**
 * One audit entry per corporation per run (per 200 claims), listing claim ids only: no
 * character id or name, so the feed stays short and keeps no pilot identity past retention.
 */
async function writeSweepAudit(
  corp: DocumentReference,
  now: number,
  claimIds: string[]
): Promise<void> {
  for (let i = 0; i < claimIds.length; i += SRP_AUDIT_MAX_CLAIM_IDS) {
    const ids = claimIds.slice(i, i + SRP_AUDIT_MAX_CLAIM_IDS);
    await corp
      .collection(SRP_AUDIT)
      .doc(`${String(now).padStart(15, '0')}~sweep-${i / SRP_AUDIT_MAX_CLAIM_IDS}`)
      .set({
        at: now,
        by: null,
        byName: 'retention sweep',
        action: 'retentionDelete',
        detail: { count: ids.length, claimIds: ids },
      });
  }
}

/**
 * Deletes every Paid or Rejected claim closed a year ago, then writes one audit entry per
 * corporation (claim ids only). Each claim is decided again inside the transaction that
 * deletes it, so a claim re-filed meanwhile is kept. Bounded per run, idempotent (a deleted
 * claim is gone), and one failing claim does not stop the rest.
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
    const deletedIds: string[] = [];
    try {
      const query = corp.collection(SRP_CLAIMS).where('closedAt', '<=', now - SRP_RETENTION_MS);
      for await (const page of pages(query, 'closedAt', pageSize)) {
        for (const candidate of page) {
          if (decideSrpClaimSweep(candidate.data(), now) !== 'delete') continue;
          if (result.deleted >= maxDeletes) {
            result.truncated = true;
            await writeSweepAudit(corp, now, deletedIds);
            return result;
          }
          try {
            const done = await db.runTransaction(async (tx) => {
              const fresh = await tx.get(candidate.ref);
              if (!fresh.exists || decideSrpClaimSweep(fresh.data() ?? {}, now) !== 'delete') {
                return false;
              }
              tx.delete(fresh.ref);
              return true;
            });
            if (done) {
              result.deleted += 1;
              deletedIds.push(candidate.id);
            }
          } catch {
            result.failed += 1;
          }
        }
      }
    } catch {
      // One corp's failing query must not skip the rest; retried next run.
      result.failed += 1;
    }
    try {
      await writeSweepAudit(corp, now, deletedIds);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
