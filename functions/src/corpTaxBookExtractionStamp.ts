// `extractionId` on every `observed` row (ADR 0032, #5254).
//
// A row's Extraction is `{structureId}_{startTimeMs}`: the pull whose fracture-to-expiry
// window covers the row's day. `mergeObservedInto` stamps rows as it writes them (this
// file's `stampRows`); `stampBook` backfills the rows written before it, once; and
// `restampStructures` re-stamps a structure's rows when an Extraction is corrected.
//
// Additive and backward-compatible (dev and prod share one project): an old client ignores
// the field. A stamp write leaves `updatedAt` alone, so no officer's device re-reads a row for it.
// Both use the structure's own expiry, like the read-time placement (`placeOfFactory`).

import type { DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { MirrorExtraction, ObservedRow } from './corpTaxBookEngine.js';
import { restampPlan, stampExtractionIds } from './corpTaxBookSyncEngine.js';

const PAGE = 400;
const MARKER = 'extractionIdStamped';

const bookOf = (db: Firestore, corporationId: number) =>
  db.collection('corps').doc(String(corporationId));

/** What placing a row needs: the book's Extractions (plus any being written) and per-structure expiry. */
export interface StampContext {
  extractions: MirrorExtraction[];
  expiryHours: Record<string, number>;
}

export async function loadStampContext(
  db: Firestore,
  corporationId: number,
  incoming: readonly MirrorExtraction[] = []
): Promise<StampContext> {
  const book = bookOf(db, corporationId);
  const [snap, stored] = await Promise.all([book.get(), book.collection('extractions').get()]);
  const byId = new Map<string, MirrorExtraction>();
  const key = (x: MirrorExtraction) => `${x.structureId}_${Date.parse(x.extractionStartTime)}`;
  for (const d of stored.docs) byId.set(d.id, d.data() as MirrorExtraction);
  for (const x of incoming) {
    // As the write does: an absent field keeps what is stored.
    const set = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
    byId.set(key(x), { ...byId.get(key(x)), ...set } as MirrorExtraction);
  }
  return {
    extractions: [...byId.values()],
    expiryHours: (snap.data()?.structureExpiryHours as Record<string, number> | undefined) ?? {},
  };
}

/** Rows with their Extraction stamp, for the merge. */
export function stampRows(rows: readonly ObservedRow[], ctx: StampContext): ObservedRow[] {
  return stampExtractionIds(rows, ctx.extractions, ctx.expiryHours);
}

const FAILED_PRECONDITION = 9;

/**
 * Writes stamps with the row's read time as a precondition, so a merge's fresher write is never
 * overwritten by a stale stamp. A page that fails on one changed row retries row by row, skipping
 * the changed ones: the merge stamped those itself. Returns how many it wrote.
 */
async function commitStamps(
  db: Firestore,
  writes: readonly {
    doc: { ref: DocumentReference; updateTime?: Timestamp };
    extractionId: string | FieldValue;
  }[]
): Promise<number> {
  if (writes.length === 0) return 0;
  const batch = db.batch();
  for (const { doc, extractionId } of writes)
    batch.update(doc.ref, { extractionId }, { lastUpdateTime: doc.updateTime! });
  try {
    await batch.commit();
    return writes.length;
  } catch (e) {
    if ((e as { code?: number }).code !== FAILED_PRECONDITION) throw e;
  }
  let written = 0;
  for (const { doc, extractionId } of writes) {
    try {
      await doc.ref.update({ extractionId }, { lastUpdateTime: doc.updateTime! });
      written += 1;
    } catch (e) {
      if ((e as { code?: number }).code !== FAILED_PRECONDITION) throw e;
    }
  }
  return written;
}

/**
 * Stamps every unstamped row of the book once; returns how many it wrote. Rows no Extraction
 * covers stay unstamped, counted in the marker; a later Extraction stamps them (`restampStructures`).
 */
export async function stampBook(
  db: Firestore,
  corporationId: number,
  now: () => number
): Promise<number> {
  const book = bookOf(db, corporationId);
  const marker = book.collection('meta').doc(MARKER);
  if ((await marker.get()).exists) return 0;
  const ctx = await loadStampContext(db, corporationId);
  let written = 0;
  let unassigned = 0;
  let last: string | undefined;
  for (;;) {
    let q = book
      .collection('observed')
      .orderBy(FieldPath.documentId())
      .select('structureId', 'date', 'extractionId')
      .limit(PAGE);
    if (last !== undefined) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    const writes: { doc: (typeof page.docs)[number]; extractionId: string }[] = [];
    for (const doc of page.docs) {
      if (doc.get('extractionId') !== undefined) continue;
      const row = { structureId: doc.get('structureId'), date: doc.get('date') } as ObservedRow;
      const [stamped] = stampRows([row], ctx);
      if (stamped?.extractionId === undefined) {
        unassigned += 1;
        continue;
      }
      writes.push({ doc, extractionId: stamped.extractionId });
    }
    written += await commitStamps(db, writes);
    last = page.docs[page.docs.length - 1].id;
    if (page.size < PAGE) break;
  }
  await marker.set({ at: now(), stamped: written, unassigned });
  return written;
}

/**
 * Re-stamps the rows of these structures against the Extractions as they stand now: an
 * Extraction corrected (a later laser time, a cancel), a new one that covers old rows, or a
 * changed expiry. Returns how many rows changed.
 */
export async function restampStructures(
  db: Firestore,
  corporationId: number,
  structureIds: readonly number[]
): Promise<number> {
  if (structureIds.length === 0) return 0;
  const ctx = await loadStampContext(db, corporationId);
  const observed = bookOf(db, corporationId).collection('observed');
  let changed = 0;
  for (const structureId of new Set(structureIds)) {
    const snap = await observed.where('structureId', '==', structureId).get();
    const docOf = new Map(snap.docs.map((d) => [d.data() as ObservedRow, d]));
    const plan = restampPlan([...docOf.keys()], ctx.extractions, ctx.expiryHours);
    const writes = plan.map(({ row, extractionId }) => ({
      doc: docOf.get(row)!,
      extractionId: extractionId ?? FieldValue.delete(),
    }));
    for (let i = 0; i < writes.length; i += PAGE)
      changed += await commitStamps(db, writes.slice(i, i + PAGE));
  }
  return changed;
}
