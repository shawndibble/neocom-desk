// SRP retention sweep (ADR 0026): deletes Paid and Rejected SRP Claims a year after they
// close. Timing: `decideSrpClaimSweep` (srpRetention.ts); which log entries go with a claim:
// `isSrpAuditForClaim`.

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_AUDIT, SRP_CLAIMS } from './srpTypes.js';
import { SRP_RETENTION_MS, decideSrpClaimSweep, isSrpAuditForClaim } from './srpRetention.js';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';

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

/** One count-only entry per corporation per run: a killmail id leads back to its pilot (#4942). */
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
 * Deletes every Paid or Rejected claim closed a year ago with its SRP log entries, one
 * transaction per claim. Each claim is decided again inside it, so one re-filed meanwhile is
 * kept with its log. One collection-group query across all corps (the per-corp scan until its
 * index is deployed; see indexedSweep.ts), so an idle run is one read. Bounded per run,
 * idempotent, and one failing claim does not stop the rest.
 */
export async function sweepSrpClaims(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<SrpSweepResult> {
  const maxDeletes = limits.maxDeletes ?? SRP_SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? SRP_SWEEP_PAGE_SIZE;
  const result: SrpSweepResult = { deleted: 0, failed: 0, truncated: false };
  const cutoff = now - SRP_RETENTION_MS;
  /** Deletes per corp, for its one count-only audit entry at the end of the run. */
  const deletedByCorp = new Map<string, { corp: DocumentReference; count: number }>();

  async function* perCorp() {
    for (const corp of await db.collection(CORPS_COLLECTION).listDocuments()) {
      try {
        yield* pages(
          corp.collection(SRP_CLAIMS).where('closedAt', '<=', cutoff),
          'closedAt',
          pageSize
        );
      } catch {
        // One corp's failing query must not skip the rest; retried next run.
        result.failed += 1;
      }
    }
  }

  const group = db.collectionGroup(SRP_CLAIMS).where('closedAt', '<=', cutoff);
  try {
    sweep: for await (const page of indexedPages(group, perCorp, {
      field: 'closedAt',
      pageSize,
      label: 'sweepSrpClaims',
    })) {
      for (const candidate of page) {
        if (!isTopLevelChild(candidate, CORPS_COLLECTION)) continue;
        if (decideSrpClaimSweep(candidate.data(), now) !== 'delete') continue;
        if (result.deleted >= maxDeletes) {
          result.truncated = true;
          break sweep;
        }
        const corp = candidate.ref.parent.parent!;
        try {
          const done = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(candidate.ref);
            if (!fresh.exists || decideSrpClaimSweep(fresh.data() ?? {}, now) !== 'delete') {
              return false;
            }
            // Claim id = killmail id.
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
            const tally = deletedByCorp.get(corp.path) ?? { corp, count: 0 };
            tally.count += 1;
            deletedByCorp.set(corp.path, tally);
          }
        } catch {
          result.failed += 1;
        }
      }
    }
  } catch {
    // The collection-group query itself failed (not a missing index): retried next run.
    result.failed += 1;
  }

  for (const { corp, count } of deletedByCorp.values()) {
    try {
      await writeSweepAudit(corp, now, count);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
