// The nightly pass over every active book's server-built docs (ADR 0032, decision
// 20261120-235011): rebuilds the moon docs that can still change and both tab read models,
// repairs any drift, flags pulls that overlap, and records how it went in `meta/verifierHealth`.
//
// The Statement-built Miner totals (`minerTotals`, #5255) are retired: every book is a Running
// account, which only an officer's tab can price, and no client reads them on one. Each pass
// deletes what is left of them, so a tab that still reads one falls back to its own figures.

import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { commitInBatches } from './commitInBatches.js';
import { verifyMoonDocs } from './corpTaxBookMoonDocsStore.js';
import { invalidateReadModels, reconcileReadModels } from './corpTaxBookReadModelsStore.js';
import { DAY_MS } from './timeConstants.js';

const book = (db: Firestore, corporationId: number) =>
  db.collection('corps').doc(String(corporationId));

export const HEALTH_DOC = 'verifierHealth';
/** The retired Statement-built totals (#5255), one doc per Miner. */
const RETIRED_MINER_TOTALS = 'minerTotals';
/** The retired totals' health doc, deleted with them. */
const RETIRED_HEALTH_DOC = 'minerTotalsHealth';
const MAX_LISTED = 25;
const VERIFIER_ACTOR = 'Nightly verifier';

/** Deletes every retired `minerTotals` doc and their health doc; none are left after the first pass. */
export async function retireMinerTotals(db: Firestore, corporationId: number): Promise<number> {
  const refs = [
    ...(await book(db, corporationId).collection(RETIRED_MINER_TOTALS).listDocuments()),
    book(db, corporationId).collection('meta').doc(RETIRED_HEALTH_DOC),
  ];
  await commitInBatches(
    db,
    refs.map((ref) => (b: WriteBatch) => void b.delete(ref))
  );
  return refs.length - 1;
}

export interface VerifyOutcome {
  moonDocMismatches: number;
  overlaps: number;
  readModelRepairs: number;
}

/** One book's nightly pass. A failed part is logged and never fails the others. */
export async function verifyBook(
  db: Firestore,
  corporationId: number,
  now: () => number
): Promise<VerifyOutcome> {
  await retireMinerTotals(db, corporationId).catch((e) =>
    console.error('miner totals retire failed', e instanceof Error ? e.message : e)
  );
  const moon = await verifyMoonDocs(db, corporationId, now()).catch((e) => {
    console.error('moon docs verify failed', e instanceof Error ? e.message : e);
    return undefined;
  });
  const moonMismatches = moon?.plan.mismatches ?? [];
  const overlaps = moon?.overlaps ?? [];
  // A doc also goes stale as an Extraction ages out of its window, so a repair is routine, not a flag.
  const readModels = await reconcileReadModels(db, corporationId, now()).catch(async (e) => {
    console.error('read models verify failed', e instanceof Error ? e.message : e);
    await invalidateReadModels(db, corporationId).catch(() => undefined);
    return undefined;
  });
  const at = now();
  const attention = moonMismatches.length > 0 || overlaps.length > 0;
  await book(db, corporationId)
    .collection('meta')
    .doc(HEALTH_DOC)
    .set({
      checkedAt: at,
      status: attention ? 'attention' : 'ok',
      moonDocsChecked: moon?.plan.checked ?? 0,
      moonDocMismatchCount: moonMismatches.length,
      moonDocMismatches: moonMismatches.slice(0, MAX_LISTED),
      overlapCount: overlaps.length,
      overlaps: overlaps.slice(0, MAX_LISTED),
      readModelRepairCount: readModels?.mismatches.length ?? 0,
      ...(moonMismatches.length > 0 ? { lastMismatchAt: at } : {}),
    });
  if (attention) {
    await book(db, corporationId)
      .collection('audit')
      .doc(`${String(at).padStart(15, '0')}~verifier`)
      .create({
        at,
        by: null,
        byName: VERIFIER_ACTOR,
        via: 'scheduled verifier',
        action: 'verifyMinerTotals',
        detail: {
          overlaps: overlaps.slice(0, MAX_LISTED),
          overlapCount: overlaps.length,
          moonDocMismatches: moonMismatches.slice(0, MAX_LISTED),
          moonDocMismatchCount: moonMismatches.length,
        },
      })
      .catch((e) => console.error('verifier audit failed', e instanceof Error ? e.message : e));
    console.error('nightly verifier: attention', {
      corporationId,
      moonDocMismatches: moonMismatches.length,
      overlaps: overlaps.length,
    });
  }
  return {
    moonDocMismatches: moonMismatches.length,
    overlaps: overlaps.length,
    readModelRepairs: readModels?.mismatches.length ?? 0,
  };
}

/** Verifies every active book, one after another, stopping at `budgetMs`. */
export async function verifyAllBooks(
  db: Firestore,
  now: () => number,
  budgetMs = 300_000
): Promise<{ books: number; failed: number; truncated: boolean }> {
  const start = now();
  const active = await db.collection('corps').where('active', '==', true).get();
  // A run cut short by the budget starts one book further along tomorrow, so none starves.
  const docs = [...active.docs].sort((a, b) => a.id.localeCompare(b.id));
  const turn = docs.length > 0 ? Math.floor(start / DAY_MS) % docs.length : 0;
  let books = 0;
  let failed = 0;
  for (const doc of [...docs.slice(turn), ...docs.slice(0, turn)]) {
    if (now() - start > budgetMs) return { books, failed, truncated: true };
    try {
      await verifyBook(db, Number(doc.id), now);
      books += 1;
    } catch (e) {
      failed += 1;
      console.error('nightly verify failed', doc.id, e instanceof Error ? e.message : e);
    }
  }
  return { books, failed, truncated: false };
}
