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

export async function reconcileReadModels(
  db: Firestore,
  corporationId: number,
  now: number,
  options: { repair: boolean } = { repair: true }
): Promise<ReadModelsPlan> {
  const ref = db.collection('corps').doc(String(corporationId));
  const [bookDoc, extractions, held] = await Promise.all([
    ref.get(),
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

export async function invalidateReadModels(db: Firestore, corporationId: number): Promise<void> {
  const batch = db.batch();
  batch.delete(sub(db, corporationId, READ_MODELS).doc(OVERVIEW_DOC));
  await batch.commit();
}

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
