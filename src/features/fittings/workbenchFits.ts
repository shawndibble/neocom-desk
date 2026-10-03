/**
 * EVE Workbench fits for one hull (issue #2484): the read half of the
 * `syncWorkbenchFits` Cloud Function (`functions/src/workbenchFits.ts`),
 * which keeps every public Workbench fit in `workbenchFits` docs grouped by
 * hull — Workbench's own list can't be filtered by hull, and its API sends no
 * CORS headers anyway.
 *
 * A hull may be split across several part docs, so this queries them all by
 * `shipTypeId` rather than reading one doc by id, and sorts the union itself
 * (an `orderBy` would need a composite index). No Firebase session: the rule
 * is a public read, since the fitter works with nobody logged in. A good
 * result is held per hull for ten minutes, like the zKillboard tab's.
 */
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { getSyncFirestore } from '@/sync/firebaseApp';

/** Mirrors `WORKBENCH_FITS_COLLECTION` in `functions/src/workbenchFits.ts`. */
export const WORKBENCH_FITS_COLLECTION = 'workbenchFits';

const CACHE_TTL_MS = 10 * 60_000;

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
    const snapshot = await getDocs(
      query(
        collection(getSyncFirestore(), WORKBENCH_FITS_COLLECTION),
        where('shipTypeId', '==', shipTypeId)
      )
    );
    const result: WorkbenchFitsResult = {
      ok: true,
      fits: mergeWorkbenchParts(snapshot.docs.map((doc) => doc.data())),
    };
    cache.set(shipTypeId, { at: now, result });
    return result;
  } catch {
    return { ok: false };
  }
}

/** The hull's Workbench fits; `null` while loading. A switch of hull drops the old hull's answer. */
export function useWorkbenchFits(shipTypeId: number): WorkbenchFitsResult | null {
  const [state, setState] = useState<{ typeId: number; result: WorkbenchFitsResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadWorkbenchFits(shipTypeId).then((result) => {
      if (!cancelled) setState({ typeId: shipTypeId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [shipTypeId]);
  return state?.typeId === shipTypeId ? state.result : null;
}
