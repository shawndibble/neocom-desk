/**
 * Writes folded open prices to Firestore: reads each touched document once,
 * merges the new day(s) into it with `mergeDays`, and commits in batches of at
 * most 500. Shared by the daily function and the backfill script (type-only
 * relative imports, see marketOrdersArchive.ts).
 */
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import type { DayPrice, KeyedDays, OpenPriceSeries } from './marketOpenPrices.js';

const BATCH_SIZE = 500;
const READ_CHUNK = 300;

export interface MergeFn {
  (
    base: { regionId: number; typeId: number },
    existing: Pick<OpenPriceSeries, 'dates' | 'buy' | 'sell'> | null,
    days: readonly DayPrice[]
  ): OpenPriceSeries;
}

/** Merges `items` into `marketOpenPrices` and returns how many documents were written. */
export async function writeOpenPrices(
  db: Firestore,
  collection: string,
  items: Iterable<KeyedDays>,
  merge: MergeFn
): Promise<number> {
  const all = [...items];
  let written = 0;
  for (let start = 0; start < all.length; start += BATCH_SIZE) {
    const slice = all.slice(start, start + BATCH_SIZE);
    const refs = slice.map((i) => db.collection(collection).doc(`${i.regionId}_${i.typeId}`));
    const snaps: DocumentSnapshot[] = [];
    for (let r = 0; r < refs.length; r += READ_CHUNK) {
      snaps.push(...(await db.getAll(...refs.slice(r, r + READ_CHUNK))));
    }
    const batch = db.batch();
    slice.forEach((item, i) => {
      const snap = snaps[i];
      const existing = snap.exists
        ? (snap.data() as Pick<OpenPriceSeries, 'dates' | 'buy' | 'sell'>)
        : null;
      batch.set(refs[i], merge(item, existing, item.days));
    });
    await batch.commit();
    written += slice.length;
  }
  return written;
}
