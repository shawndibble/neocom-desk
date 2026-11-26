import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_AUDIT, SRP_CLAIMS } from './srpTypes.js';
import { SRP_RETENTION_MS, decideSrpClaimSweep, isSrpAuditForClaim } from './srpRetention.js';
import { indexedPages, isTopLevelChild, pages } from './indexedSweep.js';

export const SRP_SWEEP_PAGE_SIZE = 100;
export const SRP_SWEEP_MAX_DELETES = 500;

export interface SrpSweepResult {
  deleted: number;
  failed: number;
  truncated: boolean;
}

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

export async function sweepSrpClaims(
  db: Firestore,
  now: number,
  limits: { maxDeletes?: number; pageSize?: number } = {}
): Promise<SrpSweepResult> {
  const maxDeletes = limits.maxDeletes ?? SRP_SWEEP_MAX_DELETES;
  const pageSize = limits.pageSize ?? SRP_SWEEP_PAGE_SIZE;
  const result: SrpSweepResult = { deleted: 0, failed: 0, truncated: false };
  const cutoff = now - SRP_RETENTION_MS;
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
