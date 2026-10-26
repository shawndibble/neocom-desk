// Firestore side of the Miner running totals (issue #5255, ADR 0032). The maths and the
// scope rules are in corpTaxBookMinerTotals.ts; this loads a book's records, writes the
// docs that changed, and runs the scheduled verifier. Shadow mode: nothing reads the docs,
// so every failure here is logged and swallowed, never thrown into the edit that caused it.

import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  MINER_TOTALS,
  overlappingPulls,
  planTotals,
  type BookRecords,
  type Scope,
  type TotalsPlan,
} from './corpTaxBookMinerTotals.js';

type Data = Record<string, unknown>;

const book = (db: Firestore, corporationId: number) =>
  db.collection('corps').doc(String(corporationId));
const sub = (db: Firestore, corporationId: number, name: string) =>
  book(db, corporationId).collection(name);

/** Firestore's `in` operator takes at most 30 values. */
const IN_LIMIT = 30;

const withId = (d: { id: string; data: () => Data }): Data => ({ ...d.data(), id: d.id });

/** The book-wide records every Miner's totals read: small collections, one read each. */
async function loadRules(db: Firestore, corporationId: number) {
  const [bookDoc, dismissals, declarations, extractions] = await Promise.all([
    book(db, corporationId).get(),
    sub(db, corporationId, 'dismissals').get(),
    sub(db, corporationId, 'declarations').get(),
    sub(db, corporationId, 'extractions').get(),
  ]);
  const b = bookDoc.data() ?? {};
  return {
    startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
    overdueDays: typeof b.overdueDays === 'number' ? b.overdueDays : 14,
    expiryHours: (b.structureExpiryHours as Record<string, number> | undefined) ?? {},
    dismissals: dismissals.docs.map(withId),
    declarations: declarations.docs.map(withId),
    extractions: extractions.docs.map((d) => d.data()),
  };
}

async function byMiner(
  db: Firestore,
  corporationId: number,
  collection: string,
  minerIds: readonly string[]
): Promise<Data[]> {
  const out: Data[] = [];
  for (let i = 0; i < minerIds.length; i += IN_LIMIT) {
    const snap = await sub(db, corporationId, collection)
      .where('minerId', 'in', minerIds.slice(i, i + IN_LIMIT))
      .get();
    out.push(...snap.docs.map(withId));
  }
  return out;
}

/** The records for `minerIds` (or every Miner), and the totals docs held for them. */
async function load(db: Firestore, corporationId: number, minerIds: readonly string[] | 'all') {
  const rules = await loadRules(db, corporationId);
  let records: BookRecords;
  const existing = new Map<string, Data>();
  if (minerIds === 'all') {
    const [statements, payments, writeOffs, miners, totals] = await Promise.all([
      sub(db, corporationId, 'statements').get(),
      sub(db, corporationId, 'payments').get(),
      sub(db, corporationId, 'writeOffs').get(),
      sub(db, corporationId, 'miners').get(),
      sub(db, corporationId, MINER_TOTALS).get(),
    ]);
    records = {
      ...rules,
      statements: statements.docs.map(withId),
      payments: payments.docs.map(withId),
      writeOffs: writeOffs.docs.map(withId),
      miners: miners.docs.map(withId),
    };
    for (const d of totals.docs) existing.set(d.id, d.data());
  } else {
    const minerRefs = minerIds.map((id) => sub(db, corporationId, 'miners').doc(id));
    const totalRefs = minerIds.map((id) => sub(db, corporationId, MINER_TOTALS).doc(id));
    const [statements, payments, writeOffs, miners, totals] = await Promise.all([
      byMiner(db, corporationId, 'statements', minerIds),
      byMiner(db, corporationId, 'payments', minerIds),
      byMiner(db, corporationId, 'writeOffs', minerIds),
      minerRefs.length > 0 ? db.getAll(...minerRefs) : [],
      totalRefs.length > 0 ? db.getAll(...totalRefs) : [],
    ]);
    records = {
      ...rules,
      statements,
      payments,
      writeOffs,
      miners: miners.filter((d) => d.exists).map(withId),
    };
    for (const d of totals) if (d.exists) existing.set(d.id, d.data() as Data);
  }
  return { records, existing };
}

async function apply(db: Firestore, corporationId: number, plan: TotalsPlan): Promise<void> {
  const ops: { ref: DocumentReference; data?: Data }[] = [
    ...plan.writes.map((t) => ({
      ref: sub(db, corporationId, MINER_TOTALS).doc(t.minerId),
      data: { ...t, updatedAt: FieldValue.serverTimestamp() },
    })),
    ...plan.deletes.map((id) => ({ ref: sub(db, corporationId, MINER_TOTALS).doc(id) })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}

/** Recomputes the totals of `scope` Miners and writes the docs that changed. */
export async function reconcileMinerTotals(
  db: Firestore,
  corporationId: number,
  scope: readonly string[] | 'all',
  options: { repair: boolean } = { repair: true }
): Promise<{ plan: TotalsPlan; records: BookRecords }> {
  const { records, existing } = await load(db, corporationId, scope);
  const plan = planTotals(records, existing, scope);
  if (options.repair) await apply(db, corporationId, plan);
  return { plan, records };
}

/** Resolves the lookups an edit's scope leaves open (a Statement's or payment's Miner). */
async function resolveMiners(db: Firestore, corporationId: number, scope: Scope) {
  const ids = new Set(scope.minerIds);
  const reads: Promise<void>[] = [];
  for (const sid of scope.statementIds) {
    if (sid.startsWith('declaration:')) {
      reads.push(
        sub(db, corporationId, 'declarations')
          .doc(sid.slice('declaration:'.length))
          .get()
          .then(async (d) => {
            const statementId = d.get('statementId');
            if (typeof statementId !== 'string') return;
            const s = await sub(db, corporationId, 'statements').doc(statementId).get();
            if (typeof s.get('minerId') === 'string') ids.add(s.get('minerId'));
          })
      );
    } else {
      reads.push(
        sub(db, corporationId, 'statements')
          .doc(sid)
          .get()
          .then((s) => {
            if (typeof s.get('minerId') === 'string') ids.add(s.get('minerId'));
          })
      );
    }
  }
  for (const pid of scope.paymentIds) {
    reads.push(
      sub(db, corporationId, 'payments')
        .doc(pid)
        .get()
        .then((p) => {
          if (typeof p.get('minerId') === 'string') ids.add(p.get('minerId'));
        })
    );
  }
  await Promise.all(reads);
  return [...ids];
}

/**
 * Brings the totals in line after an event. Best effort: a failure is logged, and the
 * verifier repairs it.
 */
export async function refreshAfterEvent(
  db: Firestore,
  corporationId: number,
  scope: Scope | readonly string[]
): Promise<void> {
  try {
    const full: Scope = Array.isArray(scope)
      ? { minerIds: [...scope], statementIds: [], paymentIds: [], all: false }
      : (scope as Scope);
    if (full.all) {
      await reconcileMinerTotals(db, corporationId, 'all');
      return;
    }
    const minerIds = await resolveMiners(db, corporationId, full);
    if (minerIds.length > 0) await reconcileMinerTotals(db, corporationId, minerIds);
  } catch (e) {
    console.error('miner totals refresh failed', e instanceof Error ? e.message : e);
  }
}

// --- The scheduled verifier ---------------------------------------------------

export const HEALTH_DOC = 'minerTotalsHealth';
const MAX_LISTED = 25;
const VERIFIER_ACTOR = 'Miner totals verifier';

export interface VerifyOutcome {
  checked: number;
  mismatches: number;
  overlaps: number;
}

/**
 * Recomputes every Miner's totals from the raw records, writes each mismatch to the audit
 * log and to `meta/minerTotalsHealth`, repairs the docs, and flags pulls that overlap.
 */
export async function verifyMinerTotals(
  db: Firestore,
  corporationId: number,
  now: () => number
): Promise<VerifyOutcome> {
  const { plan, records } = await reconcileMinerTotals(db, corporationId, 'all');
  const overlaps = overlappingPulls(records.extractions, records.expiryHours);
  const at = now();
  const health = sub(db, corporationId, 'meta').doc(HEALTH_DOC);
  await health.set({
    checkedAt: at,
    status: plan.mismatches.length === 0 && overlaps.length === 0 ? 'ok' : 'attention',
    checked: plan.checked,
    mismatchCount: plan.mismatches.length,
    mismatches: plan.mismatches.slice(0, MAX_LISTED),
    overlapCount: overlaps.length,
    overlaps: overlaps.slice(0, MAX_LISTED),
    ...(plan.mismatches.length > 0 ? { lastMismatchAt: at } : {}),
  });
  if (plan.mismatches.length > 0 || overlaps.length > 0) {
    await sub(db, corporationId, 'audit')
      .doc(`${String(at).padStart(15, '0')}~minertotals`)
      .create({
        at,
        by: null,
        byName: VERIFIER_ACTOR,
        via: 'scheduled verifier',
        action: 'verifyMinerTotals',
        detail: {
          checked: plan.checked,
          mismatches: plan.mismatches.slice(0, MAX_LISTED),
          mismatchCount: plan.mismatches.length,
          overlaps: overlaps.slice(0, MAX_LISTED),
          overlapCount: overlaps.length,
        },
      })
      .catch((e) => console.error('miner totals audit failed', e instanceof Error ? e.message : e));
    console.error('miner totals verifier: attention', {
      corporationId,
      mismatches: plan.mismatches.length,
      overlaps: overlaps.length,
    });
  }
  return { checked: plan.checked, mismatches: plan.mismatches.length, overlaps: overlaps.length };
}

/** Verifies every active book, one after another, stopping at `budgetMs`. */
export async function verifyAllMinerTotals(
  db: Firestore,
  now: () => number,
  budgetMs = 300_000
): Promise<{ books: number; failed: number; truncated: boolean }> {
  const start = now();
  const active = await db.collection('corps').where('active', '==', true).get();
  // A run cut short by the budget starts one book further along tomorrow, so none starves.
  const docs = [...active.docs].sort((a, b) => a.id.localeCompare(b.id));
  const turn = docs.length > 0 ? Math.floor(start / 86_400_000) % docs.length : 0;
  let books = 0;
  let failed = 0;
  for (const doc of [...docs.slice(turn), ...docs.slice(0, turn)]) {
    if (now() - start > budgetMs) return { books, failed, truncated: true };
    try {
      await verifyMinerTotals(db, Number(doc.id), now);
      books += 1;
    } catch (e) {
      failed += 1;
      console.error('miner totals verify failed', doc.id, e instanceof Error ? e.message : e);
    }
  }
  return { books, failed, truncated: false };
}
