/**
 * The storage side of `workbenchFits.ts`'s `WorkbenchFitsStore` (issues #2484,
 * #4271, #5071). A hull's fits are one public, gzipped Cloudflare R2 object,
 * `workbench-fits/<shipTypeId>.json` = `{ shipTypeId, fits }`, which the client
 * fetches by hull id with no Firebase session; R2's custom domain serves
 * objects by key and offers no listing, so nobody pages through every fit. A
 * hull with no object yet simply has no fits.
 *
 * The sync checkpoint is a small R2 object too (`WORKBENCH_SYNC_STATE_R2_KEY`),
 * outside the `workbench-fits/` prefix the client reads, so the runner job
 * touches no Firestore. It holds only page numbers and fit ids.
 */
import { gzipSync } from 'node:zlib';
import type { R2Get, R2Put } from './r2Client.js';
import {
  WORKBENCH_SYNC_STATE_R2_KEY,
  parseStoredFits,
  workbenchFitsR2Key,
  type HullObject,
  type PassHead,
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

const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function parseHead(value: unknown): PassHead | null {
  const head = value as Partial<PassHead> | null;
  if (!head || !Array.isArray(head.ids) || typeof head.dateAdded !== 'number') return null;
  return {
    ids: head.ids.filter((id): id is string => typeof id === 'string'),
    dateAdded: head.dateAdded,
  };
}

/** A missing or malformed checkpoint reads as a fresh start: a pass from page 1. */
export function parseSyncState(body: unknown): WorkbenchSyncState {
  const data = (body ?? {}) as {
    boundary?: unknown;
    pass?: { nextPage?: unknown; head?: unknown };
  };
  const head = parseHead(data.pass?.head);
  const nextPage = data.pass?.nextPage;
  return {
    boundary: parseHead(data.boundary),
    pass:
      head && typeof nextPage === 'number' && Number.isInteger(nextPage) && nextPage >= 1
        ? { nextPage, head }
        : null,
  };
}

export function r2WorkbenchStore(io: { get: R2Get; put: R2Put }): WorkbenchFitsStore {
  return {
    ...r2WorkbenchHulls(io),

    async readState() {
      return parseSyncState(await io.get(WORKBENCH_SYNC_STATE_R2_KEY));
    },

    async saveState(state) {
      await io.put(
        WORKBENCH_SYNC_STATE_R2_KEY,
        JSON.stringify({ ...state, updatedAt: Date.now() }),
        STATE_HEADERS
      );
    },
  };
}
