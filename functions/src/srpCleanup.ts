// SRP retention sweep (ADR 0026): the scheduled sweep that deletes Paid and
// Rejected SRP Claims one year after they close, with every srpAudit entry about them
// (#4942), leaving one count-only srpAudit entry per corporation per run. Timing is the pure
// `decideSrpClaimSweep` in srpRetention.ts; which entries go is `isSrpAuditForClaim`.

import type {
  DocumentReference,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_AUDIT, SRP_CLAIMS } from './srpTypes.js';
import { SRP_RETENTION_MS, decideSrpClaimSweep, isSrpAuditForClaim } from './srpRetention.js';

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

/**
 * One audit entry per corporation per run: the count only. A claim's killmail id leads back to
 * its pilot through public killmail data, so the entry names none (#4942).
 */
async function writeSweepAudit(corp: DocumentReference, now: number, count: number): Promise<void> {
  if (count === 0) return;
  await corp
    .collection(SRP_AUDIT)
    .doc(`${String(now).padStart(15, '0')}~sweep`)
    .set({
      at: now,
      by: null,
      byName: 'retention sweep',
      action: 'retentionDelete',
      detail: { count },
    });
}

/**
 * Deletes every Paid or Rejected claim closed a year ago, with its filing, re-filing and
 * officer entries in the SRP log, then writes one count-only audit entry per corporation. Each
 * claim is decided again inside the transaction that deletes it, so a claim re-filed meanwhile
 * is kept with its log, and a claim and its entries go together or not at all. Bounded per run, idempotent (a deleted
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
    let deletedCount = 0;
    try {
      const query = corp.collection(SRP_CLAIMS).where('closedAt', '<=', now - SRP_RETENTION_MS);
      for await (const page of pages(query, 'closedAt', pageSize)) {
        for (const candidate of page) {
          if (decideSrpClaimSweep(candidate.data(), now) !== 'delete') continue;
          if (result.deleted >= maxDeletes) {
            result.truncated = true;
            await writeSweepAudit(corp, now, deletedCount);
            return result;
          }
          try {
            const done = await db.runTransaction(async (tx) => {
              const fresh = await tx.get(candidate.ref);
              if (!fresh.exists || decideSrpClaimSweep(fresh.data() ?? {}, now) !== 'delete') {
                return false;
              }
              // The claim's id is its killmail id; every entry about it names that killmail.
              const killmailId = Number(fresh.id);
              const trail = Number.isSafeInteger(killmailId)
                ? (
                    await tx.get(
                      corp.collection(SRP_AUDIT).where('detail.killmailId', '==', killmailId)
                    )
                  ).docs.filter((entry) => isSrpAuditForClaim(entry.data(), killmailId))
                : [];
              tx.delete(fresh.ref);
              for (const entry of trail) tx.delete(entry.ref);
              return true;
            });
            if (done) {
              result.deleted += 1;
              deletedCount += 1;
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
      await writeSweepAudit(corp, now, deletedCount);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
