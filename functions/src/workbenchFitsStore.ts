/**
 * The storage side of `workbenchFits.ts`'s `WorkbenchFitsStore` (issues #2484,
 * #4271). A hull's fits are one public, gzipped Cloudflare R2 object,
 * `workbench-fits/<shipTypeId>.json` = `{ shipTypeId, fits }`, which the client
 * fetches by hull id with no Firebase session; R2's custom domain serves
 * objects by key and offers no listing, so nobody pages through every fit. A
 * hull with no object yet simply has no fits.
 *
 * The sync checkpoint stays an admin-only Firestore doc,
 * `workbenchFitsSync/state` (no client rule reaches it): it is one small doc
 * read and written once a run, and keeping it out of the public bucket keeps
 * it off the public domain.
 */
import { gzipSync } from 'node:zlib';
import type { Firestore } from 'firebase-admin/firestore';
import type { R2Get, R2Put } from './r2Client.js';
import {
  WORKBENCH_SYNC_STATE_COLLECTION,
  WORKBENCH_SYNC_STATE_DOC,
  parseStoredFits,
  workbenchFitsR2Key,
  type HullObject,
  type WorkbenchFitsStore,
  type WorkbenchSyncState,
} from './workbenchFits.js';

/**
 * The sync runs every 12 hours, and a hull only changes when it gains fits:
 * six hours of edge staleness is invisible on a list of community fits.
 */
const HULL_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=21600',
};

export type WorkbenchHulls = Pick<WorkbenchFitsStore, 'readHull' | 'writeHull'>;

/** The hull half of the store: one R2 object per hull, read and replaced whole. */
export function r2WorkbenchHulls(io: { get: R2Get; put: R2Put }): WorkbenchHulls {
  return {
    async readHull(shipTypeId) {
      return parseStoredFits(await io.get(workbenchFitsR2Key(shipTypeId)));
    },

    async writeHull(shipTypeId, fits) {
      const body: HullObject = { shipTypeId, fits };
      await io.put(workbenchFitsR2Key(shipTypeId), gzipSync(JSON.stringify(body)), HULL_HEADERS);
    },
  };
}

export function workbenchFitsStore(db: Firestore, hulls: WorkbenchHulls): WorkbenchFitsStore {
  const stateRef = db.collection(WORKBENCH_SYNC_STATE_COLLECTION).doc(WORKBENCH_SYNC_STATE_DOC);

  return {
    ...hulls,

    async readState() {
      const data = (await stateRef.get()).data() as Partial<WorkbenchSyncState> | undefined;
      return { boundary: data?.boundary ?? null, pass: data?.pass ?? null };
    },

    async saveState(state) {
      await stateRef.set({ ...state, updatedAt: Date.now() });
    },
  };
}
