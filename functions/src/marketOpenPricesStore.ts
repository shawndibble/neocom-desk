/**
 * Writes folded open prices to Firestore: reads each touched document once,
 * merges the new day(s) into it with `mergeDays`, and commits in batches of at
 * most 100: a type document at 400 days x 5 regions is ~37 KB, and a commit
 * must stay under Firestore's 10 MiB request limit. Shared by the daily function and the backfill script (type-only
 * relative imports, see marketOrdersArchive.ts).
 */
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import type { TypeDay, TypeDays, TypeOpenPrices } from './marketOpenPrices.js';

const BATCH_SIZE = 100;
const READ_CHUNK = 100;

export interface MergeFn {
  (
    base: { typeId: number },
    existing: Pick<TypeOpenPrices, 'dates' | 'regions'> | null,
    days: readonly TypeDay[]
  ): TypeOpenPrices;
}

/**
 * Merges `items` into `collection` and returns how many documents were
 * written. `items` is consumed lazily, one batch at a time, so a large
 * generator (the backfill's ~20k documents) is never materialized whole.
 * `onProgress`, when given, gets the running total after each committed batch.
 */
export async function writeOpenPrices(
  db: Firestore,
  collection: string,
  items: Iterable<TypeDays>,
  merge: MergeFn,
  onProgress?: (written: number) => void
): Promise<number> {
  let written = 0;
  let slice: TypeDays[] = [];
  const commit = async () => {
    const refs = slice.map((i) => db.collection(collection).doc(String(i.typeId)));
    const snaps: DocumentSnapshot[] = [];
    for (let r = 0; r < refs.length; r += READ_CHUNK) {
      snaps.push(...(await db.getAll(...refs.slice(r, r + READ_CHUNK))));
    }
    const batch = db.batch();
    slice.forEach((item, i) => {
      const snap = snaps[i];
      const existing = snap.exists
        ? (snap.data() as Pick<TypeOpenPrices, 'dates' | 'regions'>)
        : null;
      batch.set(refs[i], merge(item, existing, item.days));
    });
    await batch.commit();
    written += slice.length;
    slice = [];
    onProgress?.(written);
  };
  for (const item of items) {
    slice.push(item);
    if (slice.length === BATCH_SIZE) await commit();
  }
  if (slice.length > 0) await commit();
  return written;
}
