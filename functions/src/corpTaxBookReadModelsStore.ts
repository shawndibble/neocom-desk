// Firestore side of the Overview and Miners tab read models (issue #5259, ADR 0032). The maths
// is in corpTaxBookReadModels.ts; this loads what officers' tabs record and writes the docs that
// changed. A failure here is logged and swallowed, never thrown into the sync or edit that caused
// it; the nightly pass rebuilds them too.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  ACCOUNTS,
  ADJUSTMENTS,
  DECLARATIONS,
  DISMISSALS,
  DISPUTES,
  EXTRACTIONS,
  PAYMENTS,
  WRITE_OFFS,
} from './corpTaxBook.js';
import { dbReader, readNotices } from './corpTaxBookLateNoticeStore.js';
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
 * When officers last moved each Miner's account by hand: write-offs and corrections (made or
 * undone), dismissals (a Miner's own, else any Miner's) and dispute answers. Only the fields that
 * say when and whose are read.
 */
async function editsOf(db: Firestore, corporationId: number) {
  const read = (name: string, ...fields: string[]) =>
    sub(db, corporationId, name)
      .select(...fields)
      .get();
  const [writeOffs, adjustments, dismissals, disputes] = await Promise.all([
    read(WRITE_OFFS, 'minerId', 'at', 'reversed'),
    read(ADJUSTMENTS, 'minerId', 'at', 'reversed'),
    read(DISMISSALS, 'scope', 'targetId', 'at', 'reversed'),
    read(DISPUTES, 'minerId', 'resolution'),
  ]);
  const out: { minerId?: string; at: string }[] = [];
  const add = (minerId: unknown, ...ats: unknown[]) => {
    for (const at of ats)
      if (typeof at === 'string') out.push(typeof minerId === 'string' ? { minerId, at } : { at });
  };
  for (const d of [...writeOffs.docs, ...adjustments.docs])
    add(d.get('minerId'), d.get('at'), (d.get('reversed') as Data | undefined)?.at);
  for (const d of dismissals.docs)
    add(
      d.get('scope') === 'miner' ? d.get('targetId') : undefined,
      d.get('at'),
      (d.get('reversed') as Data | undefined)?.at
    );
  for (const d of disputes.docs)
    add(d.get('minerId'), (d.get('resolution') as Data | undefined)?.at);
  return out;
}

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
  const [bookDoc, accounts, notices, payments, declarations, extractions, held, edits] =
    await Promise.all([
      ref.get(),
      sub(db, corporationId, ACCOUNTS).get(),
      readNotices(dbReader(db), ref),
      sub(db, corporationId, PAYMENTS).get(),
      sub(db, corporationId, DECLARATIONS).get(),
      // The Overview lists a pull until a day past its expiry: an older chunk is never listed.
      sub(db, corporationId, EXTRACTIONS)
        .where('chunkArrivalTime', '>=', extractionsSinceOf(now))
        .get(),
      sub(db, corporationId, READ_MODELS).get(),
      editsOf(db, corporationId),
    ]);
  const b = bookDoc.data() ?? {};
  const plan = planReadModels(
    buildReadModels(
      {
        startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
        expiryHours: (b.structureExpiryHours as Record<string, number> | undefined) ?? {},
        accounts: accounts.docs.map(withId),
        notices,
        payments: payments.docs.map(withId),
        declarations: declarations.docs.map(withId),
        extractions: extractions.docs.map((d) => d.data()),
        edits,
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
