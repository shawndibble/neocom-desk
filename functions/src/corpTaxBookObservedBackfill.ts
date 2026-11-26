import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { OBSERVED_UPDATED_AT_FIELD } from './corpTaxBookVersionKeys.js';

const PAGE = 400;
const MARKER = 'observedStamped';

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
      batch.update(
        doc.ref,
        { [OBSERVED_UPDATED_AT_FIELD]: epoch },
        { lastUpdateTime: doc.updateTime }
      );
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
