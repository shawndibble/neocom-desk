/**
 * The Firestore side of `workbenchFits.ts`'s `WorkbenchFitsStore` (issue
 * #2484). A hull's fits live in `workbenchFits/{shipTypeId}_{part}` docs, each
 * `{ shipTypeId, part, fits }` — the client finds them all with one
 * `where('shipTypeId', '==', id)` query, so it never needs to know how many
 * parts a hull was split into. The sync checkpoint lives apart, in
 * `workbenchFitsSync/state`, which no client rule reaches.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  WORKBENCH_FITS_COLLECTION,
  WORKBENCH_SYNC_STATE_COLLECTION,
  WORKBENCH_SYNC_STATE_DOC,
  hullPartDocId,
  type HullPartDoc,
  type StoredWorkbenchFit,
  type WorkbenchFitsStore,
  type WorkbenchSyncState,
} from './workbenchFits.js';

/**
 * Part docs per `WriteBatch`. A part can be ~900KB, and `commit()` encodes
 * the whole batch at once — the same reason the public-contract snapshot
 * writes 5 chunk docs per batch, and well under Firestore's request size cap.
 */
const PART_DOCS_PER_BATCH = 5;

export function firestoreWorkbenchFitsStore(db: Firestore): WorkbenchFitsStore {
  const fits = db.collection(WORKBENCH_FITS_COLLECTION);
  const stateRef = db.collection(WORKBENCH_SYNC_STATE_COLLECTION).doc(WORKBENCH_SYNC_STATE_DOC);

  return {
    async readState() {
      const data = (await stateRef.get()).data() as Partial<WorkbenchSyncState> | undefined;
      return { boundary: data?.boundary ?? null, pass: data?.pass ?? null };
    },

    async saveState(state) {
      await stateRef.set({ ...state, updatedAt: Date.now() });
    },

    async readHull(shipTypeId) {
      const snapshot = await fits.where('shipTypeId', '==', shipTypeId).get();
      const docs = snapshot.docs
        .map((doc) => doc.data() as HullPartDoc)
        .sort((a, b) => a.part - b.part);
      const stored: StoredWorkbenchFit[] = docs.flatMap((doc) => doc.fits ?? []);
      const partCount = docs.length === 0 ? 0 : Math.max(...docs.map((doc) => doc.part)) + 1;
      return { fits: stored, partCount };
    },

    async writeHull(shipTypeId, parts, previousPartCount) {
      // Last part first. Parts are newest first, so new fits push older ones
      // into later parts; writing the later parts before the earlier ones
      // means a crash between batches leaves a fit in two parts (the client
      // dedupes by id) rather than overwritten out of both. Deletes go last.
      const ops: ((batch: FirebaseFirestore.WriteBatch) => void)[] = parts
        .map((partFits, part) => {
          const ref = fits.doc(hullPartDocId(shipTypeId, part));
          const doc: HullPartDoc = { shipTypeId, part, fits: partFits };
          return (batch: FirebaseFirestore.WriteBatch) => batch.set(ref, doc);
        })
        .reverse();
      for (let part = parts.length; part < previousPartCount; part += 1) {
        const ref = fits.doc(hullPartDocId(shipTypeId, part));
        ops.push((batch) => batch.delete(ref));
      }
      for (let i = 0; i < ops.length; i += PART_DOCS_PER_BATCH) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + PART_DOCS_PER_BATCH)) op(batch);
        await batch.commit();
      }
    },
  };
}
