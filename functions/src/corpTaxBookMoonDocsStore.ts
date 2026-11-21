// Firestore side of the per-pull moon docs (issue #5256, ADR 0032). The maths is in
// corpTaxBookMoonDocs.ts; this loads a pull's rows and writes the docs that changed. A refresh
// failure is logged and swallowed, never thrown into the sync or edit that caused it; the nightly
// pass repairs it.
//
// Reads stay bounded (decision 20261120-235011): a pull is rebuilt from its own rows (each row
// carries its `extractionId`), and the nightly pass rebuilds only the pulls that can still change.

import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import { extractionIdOf, type ObservedRow } from './corpTaxBookEngine.js';
import { isBookStamped } from './corpTaxBookExtractionStamp.js';
import { minerIdFor } from './corpTaxBookDonationMatch.js';
import {
  MOON_DOCS,
  moonDocsToCheck,
  overlappingPulls,
  planMoonDocs,
  type MoonDocPlan,
  type StoredExtraction,
} from './corpTaxBookMoonDocs.js';
import { utcDate } from './corpTaxBook.js';

type Data = Record<string, unknown>;

const book = (db: Firestore, corporationId: number) =>
  db.collection('corps').doc(String(corporationId));
const sub = (db: Firestore, corporationId: number, name: string) =>
  book(db, corporationId).collection(name);

/** The book's Extractions and per-structure expiry: what every pull's window rests on. */
async function loadPulls(db: Firestore, corporationId: number) {
  const [bookDoc, extractionSnap] = await Promise.all([
    book(db, corporationId).get(),
    sub(db, corporationId, 'extractions').get(),
  ]);
  return {
    extractions: extractionSnap.docs.map((d) => d.data() as StoredExtraction),
    expiryHours: (bookDoc.data()?.structureExpiryHours as Record<string, number> | undefined) ?? {},
  };
}

/**
 * The rows of each wanted pull: by its `extractionId` once the book's rows are stamped, else
 * every row of its structure (a book the stamp backfill has not reached yet).
 */
async function rowsOfPulls(
  db: Firestore,
  corporationId: number,
  wanted: readonly StoredExtraction[]
): Promise<(structureId: number) => ObservedRow[]> {
  const observed = sub(db, corporationId, 'observed');
  const rows = new Map<number, ObservedRow[]>();
  const add = (structureId: number, found: ObservedRow[]) =>
    rows.set(structureId, [...(rows.get(structureId) ?? []), ...found]);
  if (await isBookStamped(db, corporationId)) {
    for (const x of wanted) {
      const snap = await observed.where('extractionId', '==', extractionIdOf(x)).get();
      add(
        x.structureId,
        snap.docs.map((d) => d.data() as ObservedRow)
      );
    }
  } else {
    for (const structureId of new Set(wanted.map((x) => x.structureId))) {
      const snap = await observed.where('structureId', '==', structureId).get();
      add(
        structureId,
        snap.docs.map((d) => d.data() as ObservedRow)
      );
    }
  }
  return (structureId) => rows.get(structureId) ?? [];
}

/** Recomputes the docs of `scope` pulls and writes the ones that changed. */
export async function reconcileMoonDocs(
  db: Firestore,
  corporationId: number,
  scope: ReadonlySet<string>,
  options: { repair: boolean; pulls?: Awaited<ReturnType<typeof loadPulls>> } = { repair: true }
): Promise<MoonDocPlan> {
  const [{ extractions, expiryHours }, minerSnap, held] = await Promise.all([
    options.pulls ?? loadPulls(db, corporationId),
    sub(db, corporationId, 'miners').get(),
    scope.size > 0
      ? db.getAll(...[...scope].map((id) => sub(db, corporationId, MOON_DOCS).doc(id)))
      : [],
  ]);
  const existing = new Map(held.filter((d) => d.exists).map((d) => [d.id, d.data() as Data]));
  const miners = minerSnap.docs.map((m) => ({
    id: m.id,
    characterIds: (m.get('characterIds') as number[] | undefined) ?? [],
    ...(typeof m.get('createdAt') === 'string' ? { createdAt: m.get('createdAt') as string } : {}),
  }));

  const wanted = extractions.filter((x) => scope.has(extractionIdOf(x)));
  const rowsOf = await rowsOfPulls(db, corporationId, wanted);
  const plan = planMoonDocs(extractions, existing, scope, rowsOf, {
    expiryHours,
    minerOf: (characterId) => minerIdFor(characterId, miners),
  });
  if (options.repair) {
    const ops: BatchOp[] = [
      ...plan.writes.map((doc) => {
        const ref = sub(db, corporationId, MOON_DOCS).doc(doc.extractionId);
        // A legacy Extraction doc may lack a field; `set` throws on undefined and would fail the batch.
        const data = Object.fromEntries(
          Object.entries({ ...doc, updatedAt: FieldValue.serverTimestamp() }).filter(
            ([, v]) => v !== undefined
          )
        ) as Data;
        return (b: WriteBatch) => void b.set(ref, data);
      }),
      ...plan.deletes.map((id) => {
        const ref = sub(db, corporationId, MOON_DOCS).doc(id);
        return (b: WriteBatch) => void b.delete(ref);
      }),
    ];
    await commitInBatches(db, ops);
  }
  return plan;
}

/**
 * The nightly pass over a book's moon docs: rebuilds the pulls that can still gain rows, and any
 * doc missing, on another schema or whose pull is gone (`moonDocsToCheck`), and reports pulls
 * that overlap. A closed pull's rows are never read again.
 */
export async function verifyMoonDocs(
  db: Firestore,
  corporationId: number,
  now: number
): Promise<{ plan: MoonDocPlan; overlaps: ReturnType<typeof overlappingPulls> }> {
  const [pulls, docs] = await Promise.all([
    loadPulls(db, corporationId),
    sub(db, corporationId, MOON_DOCS).select('schema').get(),
  ]);
  const held = new Map(docs.docs.map((d) => [d.id, d.get('schema') as unknown]));
  const scope = moonDocsToCheck(pulls.extractions, held, pulls.expiryHours, utcDate(now));
  const plan = await reconcileMoonDocs(db, corporationId, scope, { repair: true, pulls });
  return { plan, overlaps: overlappingPulls(pulls.extractions, pulls.expiryHours) };
}

/** Brings the docs of these pulls in line after rows or an edit moved them. Best effort. */
export async function refreshMoonDocs(
  db: Firestore,
  corporationId: number,
  extractionIds: Iterable<string>
): Promise<void> {
  const ids = new Set(extractionIds);
  if (ids.size === 0) return;
  try {
    await reconcileMoonDocs(db, corporationId, ids);
  } catch (e) {
    console.error('moon docs refresh failed', e instanceof Error ? e.message : e);
  }
}
