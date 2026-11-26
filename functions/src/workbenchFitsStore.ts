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

const HULL_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=21600',
};

export type WorkbenchHulls = Pick<WorkbenchFitsStore, 'readHull' | 'writeHull'>;

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
