/**
 * The one-time copy of EVE Workbench fits from Firestore into R2 (issue
 * #4271). The fits used to live in Firestore `workbenchFits`
 * (`{shipTypeId}_{part}` docs, each `{ shipTypeId, part, fits }`). The sync is
 * incremental — its checkpoint stops each pass at fits it already stored — so
 * an empty bucket would never be refilled with the ~38k fits fetched before
 * the move. The first `syncWorkbenchFits` run after deploy therefore copies
 * that collection into R2 and does nothing else; a flag doc,
 * `workbenchFitsSync/r2Migration`, keeps every later run from reading
 * Firestore again. Delete this module (and the flag) once the legacy
 * collection is gone.
 *
 * The legacy docs are streamed a page at a time in `shipTypeId` order, so a
 * hull's parts arrive together and only a few hulls are ever in memory.
 */
import type { Firestore, QueryDocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore';
import {
  WORKBENCH_SYNC_STATE_COLLECTION,
  mergeHullFits,
  parseStoredFits,
  type StoredWorkbenchFit,
} from './workbenchFits.js';
import type { WorkbenchHulls } from './workbenchFitsStore.js';

/** Where the fits lived before R2; read once, by the migration. */
export const LEGACY_WORKBENCH_FITS_COLLECTION = 'workbenchFits';
/** Under `workbenchFitsSync`: set once the legacy collection has been copied to R2. */
export const WORKBENCH_R2_MIGRATION_DOC = 'r2Migration';

/** Hull writes in flight at once: small, latency-bound requests. */
const MIGRATION_CONCURRENCY = 16;
/** Legacy docs per Firestore page; a part doc can be ~900KB. */
const LEGACY_PAGE_SIZE = 20;

export interface WorkbenchMigrationDeps {
  isMigrated(): Promise<boolean>;
  markMigrated(): Promise<void>;
  /** Every legacy doc's data, all of one hull's parts together (`shipTypeId` order). */
  legacyParts(): AsyncIterable<unknown>;
  hulls: WorkbenchHulls;
}

export type WorkbenchMigrationResult =
  { migrated: false } | { migrated: true; hulls: number; fits: number };

function shipTypeIdOf(part: unknown): number | null {
  if (typeof part !== 'object' || part === null) return null;
  const { shipTypeId } = part as Record<string, unknown>;
  return typeof shipTypeId === 'number' ? shipTypeId : null;
}

/**
 * Copies the legacy hull parts into one R2 object per hull, merged with
 * whatever R2 already holds for it, then sets the flag. A no-op (and no
 * Firestore read) once the flag is set. A failed write throws before the flag
 * is set, so the next run retries the whole copy; the merge makes that safe.
 */
export async function migrateLegacyWorkbenchFits(
  deps: WorkbenchMigrationDeps
): Promise<WorkbenchMigrationResult> {
  if (await deps.isMigrated()) return { migrated: false };

  const pending = new Set<Promise<void>>();
  const flushed = new Set<number>();
  let failure: unknown = null;
  let fitCount = 0;

  const flush = async (shipTypeId: number, legacy: StoredWorkbenchFit[]) => {
    // Out-of-order parts for a hull already written: let that write land first.
    if (flushed.has(shipTypeId)) await Promise.all(pending);
    flushed.add(shipTypeId);
    while (pending.size >= MIGRATION_CONCURRENCY) await Promise.race(pending);
    const fits = mergeHullFits([], legacy);
    fitCount += fits.length;
    const write = (async () => {
      const merged = mergeHullFits(await deps.hulls.readHull(shipTypeId), fits);
      await deps.hulls.writeHull(shipTypeId, merged);
    })()
      .catch((err: unknown) => {
        failure ??= err;
      })
      .finally(() => pending.delete(write));
    pending.add(write);
  };

  let current: { shipTypeId: number; fits: StoredWorkbenchFit[] } | null = null;
  for await (const part of deps.legacyParts()) {
    const shipTypeId = shipTypeIdOf(part);
    if (shipTypeId === null) continue;
    if (current && current.shipTypeId !== shipTypeId) {
      await flush(current.shipTypeId, current.fits);
      current = null;
    }
    current ??= { shipTypeId, fits: [] };
    current.fits.push(...parseStoredFits(part));
  }
  if (current) await flush(current.shipTypeId, current.fits);
  await Promise.all(pending);
  if (failure !== null) throw failure;

  await deps.markMigrated();
  return { migrated: true, hulls: flushed.size, fits: fitCount };
}

/** The migration's Firestore side: the legacy collection, paged, and the flag doc. */
export function firestoreWorkbenchMigration(
  db: Firestore
): Pick<WorkbenchMigrationDeps, 'isMigrated' | 'markMigrated' | 'legacyParts'> {
  const flagRef = db.collection(WORKBENCH_SYNC_STATE_COLLECTION).doc(WORKBENCH_R2_MIGRATION_DOC);
  return {
    async isMigrated() {
      return (await flagRef.get()).exists;
    },
    async markMigrated() {
      await flagRef.set({ migratedAt: Date.now() });
    },
    async *legacyParts() {
      const base = db
        .collection(LEGACY_WORKBENCH_FITS_COLLECTION)
        // One field only, so no composite index; part order doesn't matter
        // (the merge sorts), only that a hull's parts arrive together.
        .orderBy('shipTypeId')
        .limit(LEGACY_PAGE_SIZE);
      let last: QueryDocumentSnapshot | null = null;
      for (;;) {
        const page: QuerySnapshot = await (last ? base.startAfter(last) : base).get();
        for (const doc of page.docs) yield doc.data();
        if (page.docs.length < LEGACY_PAGE_SIZE) return;
        last = page.docs[page.docs.length - 1];
      }
    },
  };
}
