// Firestore side of the tab read models (issue #5259, ADR 0032). The rules are in
// corpTaxBookReadModels.ts; this reads the recent Extractions and writes the doc when it changed.
// A failure here is logged and swallowed, never thrown into the sync or edit that caused it; the
// nightly pass rebuilds it too.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { EXTRACTIONS } from './corpTaxBook.js';
import { extractionsSinceOf } from './corpTaxBookQuietRun.js';
import {
  OVERVIEW_DOC,
  READ_MODELS,
  buildReadModels,
  planReadModels,
  type ReadModelsPlan,
} from './corpTaxBookReadModels.js';

type Data = Record<string, unknown>;

const sub = (db: Firestore, corporationId: number, name: string) =>
  db.collection('corps').doc(String(corporationId)).collection(name);

/**
 * Rebuilds the doc and writes it when it differs; with `repair: false` it only reports. Reads
 * only the book doc, the Extractions recent enough to be listed, and the docs held.
 */
export async function reconcileReadModels(
  db: Firestore,
  corporationId: number,
  now: number,
  options: { repair: boolean } = { repair: true }
): Promise<ReadModelsPlan> {
  const ref = db.collection('corps').doc(String(corporationId));
  const [bookDoc, extractions, held] = await Promise.all([
    ref.get(),
    // The Overview lists a pull until a day past its expiry: an older chunk is never listed.
    sub(db, corporationId, EXTRACTIONS)
      .where('chunkArrivalTime', '>=', extractionsSinceOf(now))
      .get(),
    sub(db, corporationId, READ_MODELS).get(),
  ]);
  const plan = planReadModels(
    buildReadModels(
      {
        expiryHours:
          (bookDoc.data()?.structureExpiryHours as Record<string, number> | undefined) ?? {},
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

/** Removes the doc so a client falls back to the Extractions instead of trusting a stale one. */
export async function invalidateReadModels(db: Firestore, corporationId: number): Promise<void> {
  const batch = db.batch();
  batch.delete(sub(db, corporationId, READ_MODELS).doc(OVERVIEW_DOC));
  await batch.commit();
}

/**
 * Brings the doc in line after an Extraction or an edit moved it. Best effort, but a rebuild that
 * fails (a doc past 1 MiB, say) deletes the doc: a missing doc is a fallback, a stale one is wrong.
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
