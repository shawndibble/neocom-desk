/**
 * The Firestore side of `workbenchFits.ts`'s `WorkbenchFitsStore` (issue
 * #2484). A hull's fits live in `workbenchFits/{shipTypeId}_{part}` docs, each
 * `{ shipTypeId, part, fits }`, with part 0 also carrying `parts`, the hull's
 * part count. Clients may only `get` these by id (listing is denied, so nobody
 * can page through all ~38k fits on our read bill): they read part 0, then the
 * parts it claims. The sync checkpoint lives apart, in `workbenchFitsSync/state`,
 * which no client rule reaches.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  WORKBENCH_FITS_COLLECTION,
  WORKBENCH_SYNC_STATE_COLLECTION,
  WORKBENCH_SYNC_STATE_DOC,
  planHullWrite,
  type HullPartDoc,
  type StoredWorkbenchFit,
  type WorkbenchFitsStore,
  type WorkbenchSyncState,
} from './workbenchFits.js';

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
      // A query, not part 0's count: admin reads skip the rules, and a query
      // also finds parts a crashed run left past the count, so their fits are
      // re-merged and the docs deleted. Don't switch this to the client's
      // read-by-id.
      const snapshot = await fits.where('shipTypeId', '==', shipTypeId).get();
      const docs = snapshot.docs
        .map((doc) => doc.data() as HullPartDoc)
        .sort((a, b) => a.part - b.part);
      const stored: StoredWorkbenchFit[] = docs.flatMap((doc) => doc.fits ?? []);
      const partCount = docs.length === 0 ? 0 : Math.max(...docs.map((doc) => doc.part)) + 1;
      return { fits: stored, partCount };
    },

    async writeHull(shipTypeId, parts, previousPartCount) {
      // Batches in order: see planHullWrite for why the order is crash-safe.
      for (const ops of planHullWrite(shipTypeId, parts, previousPartCount)) {
        const batch = db.batch();
        for (const op of ops) {
          const ref = fits.doc(op.docId);
          if (op.kind === 'set') batch.set(ref, op.doc);
          else batch.delete(ref);
        }
        await batch.commit();
      }
    },
  };
}
