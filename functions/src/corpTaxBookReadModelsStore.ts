// Firestore side of the Overview and Miners tab read models (issue #5259, ADR 0032). The
// maths is in corpTaxBookReadModels.ts; this loads a book's frozen records and writes the
// docs that changed. Shadow mode: nothing reads the docs until the screens' switch flips,
// so a failure here is logged and swallowed, never thrown into the sync or edit that caused
// it. The scheduled verifier rebuilds them too.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { loadRules, withId } from './corpTaxBookMinerTotalsStore.js';
import type { BookRecords } from './corpTaxBookMinerTotals.js';
import {
  READ_MODELS,
  buildReadModels,
  planReadModels,
  type ReadModelsPlan,
} from './corpTaxBookReadModels.js';

type Data = Record<string, unknown>;

const sub = (db: Firestore, corporationId: number, name: string) =>
  db.collection('corps').doc(String(corporationId)).collection(name);

/**
 * Rebuilds both docs from the book's frozen records and writes the ones that differ. With
 * `repair: false` it only reports. Reads the small collections whole: no ledger rows.
 */
export async function reconcileReadModels(
  db: Firestore,
  corporationId: number,
  now: number,
  options: { repair: boolean } = { repair: true }
): Promise<ReadModelsPlan> {
  const [rules, statements, payments, writeOffs, miners, held] = await Promise.all([
    loadRules(db, corporationId),
    sub(db, corporationId, 'statements').get(),
    sub(db, corporationId, 'payments').get(),
    sub(db, corporationId, 'writeOffs').get(),
    sub(db, corporationId, 'miners').get(),
    sub(db, corporationId, READ_MODELS).get(),
  ]);
  const records: BookRecords = {
    ...rules,
    statements: statements.docs.map(withId),
    payments: payments.docs.map(withId),
    writeOffs: writeOffs.docs.map(withId),
    miners: miners.docs.map(withId),
  };
  const plan = planReadModels(
    buildReadModels(records, now),
    new Map(held.docs.map((d) => [d.id, d.data() as Data]))
  );
  if (options.repair && plan.writes.length > 0) {
    const batch = db.batch();
    for (const w of plan.writes)
      batch.set(sub(db, corporationId, READ_MODELS).doc(w.id), {
        ...w.data,
        updatedAt: FieldValue.serverTimestamp(),
      });
    await batch.commit();
  }
  return plan;
}

/** Brings the docs in line after rows or an edit moved them. Best effort. */
export async function refreshReadModels(
  db: Firestore,
  corporationId: number,
  now: number
): Promise<void> {
  try {
    await reconcileReadModels(db, corporationId, now);
  } catch (e) {
    console.error('read models refresh failed', e instanceof Error ? e.message : e);
  }
}
