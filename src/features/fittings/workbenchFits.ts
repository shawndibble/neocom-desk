/**
 * EVE Workbench fits for one hull (issue #2484): the read half of the
 * `syncWorkbenchFits` Cloud Function (`functions/src/workbenchFits.ts`),
 * which keeps every public Workbench fit in `workbenchFits` docs grouped by
 * hull — Workbench's own list can't be filtered by hull, and its API sends no
 * CORS headers anyway.
 *
 * A hull may be split across several `{shipTypeId}_{part}` docs. The rules
 * allow `get` by id only — never `list`, so nobody can page through the whole
 * collection on our read bill — so this reads part 0, whose `parts` says how
 * many there are, then the rest in parallel, and sorts the union itself. No
 * Firebase session: the rule is a public get, since the fitter works with
 * nobody logged in. A good result is held per hull for ten minutes, like the
 * zKillboard tab's.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { getSyncFirestore } from '@/sync/firebaseApp';

/** Mirrors `WORKBENCH_FITS_COLLECTION` in `functions/src/workbenchFits.ts`. */
export const WORKBENCH_FITS_COLLECTION = 'workbenchFits';

const CACHE_TTL_MS = 10 * 60_000;

/**
 * Most parts one hull is read as, against a corrupt count. A part holds
 * ~900KB of fits; the biggest hull needs a handful.
 */
const MAX_PARTS = 50;

/** One stored Workbench fit — mirrors `StoredWorkbenchFit` on the Functions side. */
export interface WorkbenchFit {
  id: string;
  name: string;
  authorId: number | null;
  authorName: string;
  /** Epoch millis. */
  dateAdded: number;
  eft: string;
}

/** `ok: false` when the stored list couldn't be read — distinct from an empty one. */
export type WorkbenchFitsResult = { ok: true; fits: WorkbenchFit[] } | { ok: false };

/** The fit's own page on eveworkbench.com — the same `/fit/{id}` path a pasted Workbench link uses. */
export function workbenchFitUrl(id: string): string {
  return `https://eveworkbench.com/fit/${encodeURIComponent(id)}`;
}

/** Every part's fits as one list, one per id, newest first. */
export function mergeWorkbenchParts(parts: readonly { fits?: unknown }[]): WorkbenchFit[] {
  const byId = new Map<string, WorkbenchFit>();
  for (const part of parts) {
    if (!Array.isArray(part.fits)) continue;
    for (const fit of part.fits as WorkbenchFit[]) {
      if (typeof fit?.id === 'string' && typeof fit.eft === 'string') byId.set(fit.id, fit);
    }
  }
  // Same order as the Functions side's `newestFirst`: newest, then by id.
  return [...byId.values()].sort(
    (a, b) => b.dateAdded - a.dateAdded || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * How many parts a hull has, from its part 0 doc's data (`undefined`: no such
 * doc, no fits). A part 0 with no usable `parts` predates the count — read it
 * as one part. Mirrors `hullPartCount` in `functions/src/workbenchFits.ts`.
 */
export function workbenchPartCount(part0: unknown): number {
  if (!isRecord(part0)) return 0;
  const { parts } = part0;
  return typeof parts === 'number' && Number.isInteger(parts) && parts >= 1 ? parts : 1;
}

/** Mirrors `hullPartDocId` on the Functions side. */
function partDocId(shipTypeId: number, part: number): string {
  return `${shipTypeId}_${part}`;
}

const cache = new Map<number, { at: number; result: WorkbenchFitsResult }>();

/** For tests: forget every cached hull. */
export function resetWorkbenchFitsCache(): void {
  cache.clear();
}

/** The hull's stored Workbench fits. Never throws. */
export async function loadWorkbenchFits(
  shipTypeId: number,
  now: number = Date.now()
): Promise<WorkbenchFitsResult> {
  const hit = cache.get(shipTypeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  if (!isSyncConfigured()) return { ok: false };
  try {
    const db = getSyncFirestore();
    const read = async (part: number) => {
      const snapshot = await getDoc(
        doc(db, WORKBENCH_FITS_COLLECTION, partDocId(shipTypeId, part))
      );
      return snapshot.exists() ? snapshot.data() : undefined;
    };
    const part0 = await read(0);
    const count = Math.min(workbenchPartCount(part0), MAX_PARTS);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, count - 1) }, (_, i) => read(i + 1))
    );
    // A claimed part can be missing: the sync deletes surplus parts right
    // after it lowers part 0's count, so a reader holding the old count can
    // race the delete. Skip it rather than fail the whole hull.
    const parts = [part0, ...rest].filter(isRecord);
    const result: WorkbenchFitsResult = { ok: true, fits: mergeWorkbenchParts(parts) };
    cache.set(shipTypeId, { at: now, result });
    return result;
  } catch {
    return { ok: false };
  }
}
