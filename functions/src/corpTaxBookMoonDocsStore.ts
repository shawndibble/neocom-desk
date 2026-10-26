// Firestore side of the per-pull moon docs (issue #5256, ADR 0032). The maths is in
// corpTaxBookMoonDocs.ts; this loads a book's rows and writes the docs that changed.
// Shadow mode: nothing reads the docs, so a refresh failure is logged and swallowed, never
// thrown into the sync or edit that caused it. The scheduled verifier repairs it.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { extractionIdOf, moonOnDay, type ObservedRow } from './corpTaxBookEngine.js';
import {
  MOON_DOCS,
  planMoonDocs,
  type MoonDocPlan,
  type StoredExtraction,
} from './corpTaxBookMoonDocs.js';

type Data = Record<string, unknown>;

const book = (db: Firestore, corporationId: number) =>
  db.collection('corps').doc(String(corporationId));
const sub = (db: Firestore, corporationId: number, name: string) =>
  book(db, corporationId).collection(name);

/** Recomputes the docs of `scope` pulls (or all) and writes the ones that changed. */
export async function reconcileMoonDocs(
  db: Firestore,
  corporationId: number,
  scope: ReadonlySet<string> | 'all',
  options: { repair: boolean } = { repair: true }
): Promise<MoonDocPlan> {
  const [bookDoc, extractionSnap, statementSnap, minerSnap, docSnap] = await Promise.all([
    book(db, corporationId).get(),
    sub(db, corporationId, 'extractions').get(),
    sub(db, corporationId, 'statements').get(),
    sub(db, corporationId, 'miners').get(),
    sub(db, corporationId, MOON_DOCS).get(),
  ]);
  const extractions = extractionSnap.docs.map((d) => d.data() as StoredExtraction);
  const existing = new Map(docSnap.docs.map((d) => [d.id, d.data() as Data]));
  const minerByCharacter = new Map<number, string>();
  for (const m of minerSnap.docs)
    for (const id of (m.get('characterIds') as number[] | undefined) ?? [])
      minerByCharacter.set(id, m.id);

  // A structure's rows are read once, only for the structures a wanted pull is at.
  const wanted = extractions.filter((x) => scope === 'all' || scope.has(extractionIdOf(x)));
  const rows = new Map<number, ObservedRow[]>();
  for (const structureId of new Set(wanted.map((x) => x.structureId))) {
    const snap = await sub(db, corporationId, 'observed')
      .where('structureId', '==', structureId)
      .get();
    rows.set(
      structureId,
      snap.docs.map((d) => d.data() as ObservedRow)
    );
  }

  const plan = planMoonDocs(extractions, existing, scope, (s) => rows.get(s) ?? [], {
    expiryHours: (bookDoc.data()?.structureExpiryHours as Record<string, number> | undefined) ?? {},
    statements: statementSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
    minerOf: (characterId) => minerByCharacter.get(characterId) ?? `solo:${characterId}`,
  });
  if (options.repair) {
    const ops = [
      ...plan.writes.map((doc) => ({
        ref: sub(db, corporationId, MOON_DOCS).doc(doc.extractionId),
        data: { ...doc, updatedAt: FieldValue.serverTimestamp() } as Data,
      })),
      ...plan.deletes.map((id) => ({
        ref: sub(db, corporationId, MOON_DOCS).doc(id),
        data: undefined,
      })),
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
  return plan;
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

/** The pulls a set of (structure, day) pairs fall in, for an edit that names days, not pulls. */
export async function pullsOfDays(
  db: Firestore,
  corporationId: number,
  days: readonly { structureId: number; date: string }[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (days.length === 0) return out;
  const [bookDoc, extractionSnap] = await Promise.all([
    book(db, corporationId).get(),
    sub(db, corporationId, 'extractions').get(),
  ]);
  const extractions = extractionSnap.docs.map((d) => d.data() as StoredExtraction);
  const expiryHours =
    (bookDoc.data()?.structureExpiryHours as Record<string, number> | undefined) ?? {};
  for (const { structureId, date } of days) {
    const id = moonOnDay(extractions, expiryHours, structureId, date).extractionId;
    if (id !== undefined) out.add(id);
  }
  return out;
}
