// Firestore side of the Overview and Miners tab read models (issue #5259, ADR 0032). The maths
// is in corpTaxBookReadModels.ts; this loads what officers' tabs record and writes the docs that
// changed. A failure here is logged and swallowed, never thrown into the sync or edit that caused
// it; the nightly pass rebuilds them too.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ACCOUNTS, DECLARATIONS, EXTRACTIONS, LATE_NOTICES, PAYMENTS } from './corpTaxBook.js';
import { mergeNotices } from './corpTaxBookLateNoticeStore.js';
import { legacyNotices } from './corpTaxBookLegacyMirror.js';
import { extractionsSinceOf } from './corpTaxBookQuietRun.js';
import {
  MINER_LIST_DOC,
  OVERVIEW_DOC,
  READ_MODELS,
  buildReadModels,
  planReadModels,
  type ReadModelsPlan,
} from './corpTaxBookReadModels.js';

type Data = Record<string, unknown>;

const sub = (db: Firestore, corporationId: number, name: string) =>
  db.collection('corps').doc(String(corporationId)).collection(name);

const withId = (d: { id: string; data: () => Data }): Data => ({ ...d.data(), id: d.id });

/**
 * Rebuilds both docs and writes the ones that differ; with `repair: false` it only reports. Reads
 * no ledger row and no Statement: each Miner's recorded account, their Late notices, payments and
 * declarations, and only the Extractions recent enough to be listed.
 */
export async function reconcileReadModels(
  db: Firestore,
  corporationId: number,
  now: number,
  options: { repair: boolean } = { repair: true }
): Promise<ReadModelsPlan> {
  const ref = db.collection('corps').doc(String(corporationId));
  const [bookDoc, accounts, current, legacy, payments, declarations, extractions, held] =
    await Promise.all([
      ref.get(),
      sub(db, corporationId, ACCOUNTS).get(),
      sub(db, corporationId, LATE_NOTICES).get(),
      legacyNotices(ref).get(),
      sub(db, corporationId, PAYMENTS).get(),
      sub(db, corporationId, DECLARATIONS).get(),
      // The Overview lists a pull until a day past its expiry: an older chunk is never listed.
      sub(db, corporationId, EXTRACTIONS)
        .where('chunkArrivalTime', '>=', extractionsSinceOf(now))
        .get(),
      sub(db, corporationId, READ_MODELS).get(),
    ]);
  const b = bookDoc.data() ?? {};
  const plan = planReadModels(
    buildReadModels(
      {
        startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
        expiryHours: (b.structureExpiryHours as Record<string, number> | undefined) ?? {},
        accounts: accounts.docs.map(withId),
        notices: mergeNotices(current, legacy),
        payments: payments.docs.map(withId),
        declarations: declarations.docs.map(withId),
        extractions: extractions.docs.map((d) => d.data()),
      },
      now
    ),
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

/** Removes both docs so a client falls back to the whole-book view instead of trusting stale ones. */
export async function invalidateReadModels(db: Firestore, corporationId: number): Promise<void> {
  const batch = db.batch();
  for (const id of [MINER_LIST_DOC, OVERVIEW_DOC])
    batch.delete(sub(db, corporationId, READ_MODELS).doc(id));
  await batch.commit();
}

/**
 * Brings the docs in line after rows or an edit moved them. Best effort, but a rebuild that
 * fails (a doc past 1 MiB, say) deletes the docs: a missing doc is a fallback, a stale one is wrong.
 */
export async function refreshReadModels(
  db: Firestore,
  corporationId: number,
  now: number
): Promise<void> {
  try {
    await reconcileReadModels(db, corporationId, now);
  } catch (e) {
    console.error('read models refresh failed', e instanceof Error ? e.message : e);
    await invalidateReadModels(db, corporationId).catch(() => undefined);
  }
}
