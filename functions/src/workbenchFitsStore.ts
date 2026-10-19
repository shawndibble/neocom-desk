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
 *
 * **Migration.** The fits used to live in Firestore `workbenchFits`
 * (`{shipTypeId}_{part}` docs). The sync is incremental — its checkpoint
 * stops each pass at fits it already stored — so an empty bucket would never
 * be refilled with the ~38k fits fetched before the move. The first run after
 * deploy therefore copies that collection into R2 (`migrateLegacyWorkbenchFits`)
 * and does nothing else; a flag doc, `workbenchFitsSync/r2Migration`, keeps
 * every later run from reading Firestore again.
 */
import { gzipSync } from 'node:zlib';
import type { Firestore } from 'firebase-admin/firestore';
import type { R2Get, R2Put } from './r2Client.js';
import {
  WORKBENCH_SYNC_STATE_COLLECTION,
  mergeHullFits,
  WORKBENCH_SYNC_STATE_DOC,
  workbenchFitsR2Key,
  type HullObject,
  type StoredWorkbenchFit,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function storedFit(row: unknown): StoredWorkbenchFit | null {
  if (!isRecord(row)) return null;
  const { id, name, authorId, authorName, dateAdded, eft } = row;
  if (typeof id !== 'string' || typeof eft !== 'string' || typeof dateAdded !== 'number') {
    return null;
  }
  return {
    id,
    name: typeof name === 'string' ? name : '',
    authorId: typeof authorId === 'number' ? authorId : null,
    authorName: typeof authorName === 'string' ? authorName : '',
    dateAdded,
    eft,
  };
}

/** The hull half of the store: one R2 object per hull, read and replaced whole. */
export function r2WorkbenchHulls(io: {
  get: R2Get;
  put: R2Put;
}): Pick<WorkbenchFitsStore, 'readHull' | 'writeHull'> {
  return {
    async readHull(shipTypeId) {
      const raw = await io.get(workbenchFitsR2Key(shipTypeId));
      if (!isRecord(raw) || !Array.isArray(raw.fits)) return [];
      return raw.fits.map(storedFit).filter((fit): fit is StoredWorkbenchFit => fit !== null);
    },

    async writeHull(shipTypeId, fits) {
      const body: HullObject = { shipTypeId, fits };
      await io.put(workbenchFitsR2Key(shipTypeId), gzipSync(JSON.stringify(body)), HULL_HEADERS);
    },
  };
}

export function workbenchFitsStore(
  db: Firestore,
  io: { get: R2Get; put: R2Put }
): WorkbenchFitsStore {
  const stateRef = db.collection(WORKBENCH_SYNC_STATE_COLLECTION).doc(WORKBENCH_SYNC_STATE_DOC);

  return {
    ...r2WorkbenchHulls(io),

    async readState() {
      const data = (await stateRef.get()).data() as Partial<WorkbenchSyncState> | undefined;
      return { boundary: data?.boundary ?? null, pass: data?.pass ?? null };
    },

    async saveState(state) {
      await stateRef.set({ ...state, updatedAt: Date.now() });
    },
  };
}

/** Where the fits lived before R2; read once, by the migration. */
export const LEGACY_WORKBENCH_FITS_COLLECTION = 'workbenchFits';
/** Under `workbenchFitsSync`: set once the legacy collection has been copied to R2. */
export const WORKBENCH_R2_MIGRATION_DOC = 'r2Migration';

/** Hull objects written at once during the migration: small, latency-bound requests. */
const MIGRATION_CONCURRENCY = 16;

export interface WorkbenchMigrationDeps {
  isMigrated(): Promise<boolean>;
  markMigrated(): Promise<void>;
  /** Every legacy `workbenchFits` doc's data: `{ shipTypeId, part, parts?, fits }`. */
  readLegacyParts(): Promise<unknown[]>;
  hulls: Pick<WorkbenchFitsStore, 'readHull' | 'writeHull'>;
}

export type WorkbenchMigrationResult =
  { migrated: false } | { migrated: true; hulls: number; fits: number };

/**
 * Copies the legacy Firestore hull parts into one R2 object per hull, merged
 * with whatever R2 already holds for it, then sets the flag. A no-op (and no
 * Firestore read) once the flag is set. A failed write throws before the flag
 * is set, so the next run retries the whole copy; the merge makes that safe.
 */
export async function migrateLegacyWorkbenchFits(
  deps: WorkbenchMigrationDeps
): Promise<WorkbenchMigrationResult> {
  if (await deps.isMigrated()) return { migrated: false };

  const byHull = new Map<number, StoredWorkbenchFit[]>();
  for (const part of await deps.readLegacyParts()) {
    if (!isRecord(part) || typeof part.shipTypeId !== 'number' || !Array.isArray(part.fits)) {
      continue;
    }
    const fits = part.fits.map(storedFit).filter((fit): fit is StoredWorkbenchFit => fit !== null);
    byHull.set(part.shipTypeId, [...(byHull.get(part.shipTypeId) ?? []), ...fits]);
  }

  const queue = [...byHull];
  let fitCount = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [shipTypeId, legacy] = next;
      const merged = mergeHullFits(await deps.hulls.readHull(shipTypeId), legacy);
      await deps.hulls.writeHull(shipTypeId, merged);
      fitCount += legacy.length;
    }
  };
  await Promise.all(Array.from({ length: MIGRATION_CONCURRENCY }, worker));

  await deps.markMigrated();
  return { migrated: true, hulls: byHull.size, fits: fitCount };
}

/** The migration's Firestore side: the legacy collection and the flag doc. */
export function firestoreWorkbenchMigration(
  db: Firestore
): Pick<WorkbenchMigrationDeps, 'isMigrated' | 'markMigrated' | 'readLegacyParts'> {
  const flagRef = db.collection(WORKBENCH_SYNC_STATE_COLLECTION).doc(WORKBENCH_R2_MIGRATION_DOC);
  return {
    async isMigrated() {
      return (await flagRef.get()).exists;
    },
    async markMigrated() {
      await flagRef.set({ migratedAt: Date.now() });
    },
    async readLegacyParts() {
      const snapshot = await db.collection(LEGACY_WORKBENCH_FITS_COLLECTION).get();
      return snapshot.docs.map((doc) => doc.data());
    },
  };
}
