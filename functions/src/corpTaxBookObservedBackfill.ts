// One-time backfill of `updatedAt` on a book's old `observed` rows (#5243).
//
// #5233 stamps `updatedAt` on every row a merge writes; rows written before it
// have none. A client reads `observed` as a delta by that stamp and no longer
// re-reads the whole collection daily (src/features/corp/taxBook/observedDelta.ts),
// so every row must carry one. A row with no stamp gets the epoch: older than any
// real write, so it never looks changed to a device that already holds it, and a
// device with no copy reads the whole collection anyway.
//
// Additive and backward-compatible (dev and prod share one project): an old
// client ignores the field. `meta/observedStamped` marks a book done; the pass
// runs from the scheduled sync and an officer's sync, never fails either, and
// starts over from the top if a run dies midway (rows already stamped are skipped).

import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { OBSERVED_UPDATED_AT_FIELD } from './corpTaxBookVersionKeys.js';

const PAGE = 400;
const MARKER = 'observedStamped';

/** Stamps every unstamped `observed` row of the book once; returns how many it wrote. */
export async function backfillObservedUpdatedAt(
  db: Firestore,
  corporationId: number,
  now: () => number
): Promise<number> {
  const book = db.collection('corps').doc(String(corporationId));
  const marker = book.collection('meta').doc(MARKER);
  if ((await marker.get()).exists) return 0;
  const observed = book.collection('observed');
  const epoch = Timestamp.fromMillis(0);
  let written = 0;
  let last: string | undefined;
  for (;;) {
    let q = observed.orderBy(FieldPath.documentId()).select(OBSERVED_UPDATED_AT_FIELD).limit(PAGE);
    if (last !== undefined) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    const batch = db.batch();
    let pending = 0;
    for (const doc of page.docs) {
      if (doc.get(OBSERVED_UPDATED_AT_FIELD) !== undefined) continue;
      batch.update(doc.ref, { [OBSERVED_UPDATED_AT_FIELD]: epoch });
      pending += 1;
    }
    if (pending > 0) await batch.commit();
    written += pending;
    last = page.docs[page.docs.length - 1].id;
    if (page.size < PAGE) break;
  }
  await marker.set({ at: now() });
  return written;
}
