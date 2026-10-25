/**
 * EVE Workbench fits for one hull (issue #2484): the read half of the
 * `public-data-workbench-fits` GitHub Actions job (`functions/src/workbenchFits.ts`),
 * which keeps every public Workbench fit grouped by hull — Workbench's own
 * list can't be filtered by hull, and its API sends no CORS headers anyway.
 *
 * Each hull is one static object in Cloudflare R2,
 * `workbench-fits/<shipTypeId>.json` (issue #4271), fetched by hull id: the
 * public domain serves objects by key and offers no listing, so nobody pages
 * through every fit. No Firebase session, since the fitter works with nobody
 * logged in. A hull with no object yet (the sync hasn't reached it, or it has
 * no public fits) reads as no fits, not a failure. A good result is held per
 * hull for ten minutes, like the zKillboard tab's.
 */
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';

const CACHE_TTL_MS = 10 * 60_000;
const READ_TIMEOUT_MS = 20_000;

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

/** Mirrors `workbenchFitsR2Key` on the Functions side. */
export function workbenchFitsUrl(shipTypeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/workbench-fits/${shipTypeId}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A hull object's fits, one per id, newest first; malformed rows (or a malformed object) are skipped. */
export function parseWorkbenchHull(data: unknown): WorkbenchFit[] {
  if (!isRecord(data) || !Array.isArray(data.fits)) return [];
  const byId = new Map<string, WorkbenchFit>();
  for (const fit of data.fits as unknown[]) {
    if (
      isRecord(fit) &&
      typeof fit.id === 'string' &&
      typeof fit.eft === 'string' &&
      typeof fit.dateAdded === 'number'
    ) {
      byId.set(fit.id, fit as unknown as WorkbenchFit);
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
  try {
    const response = await fetch(workbenchFitsUrl(shipTypeId), {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    let fits: WorkbenchFit[];
    if (response.status === 404) fits = [];
    else if (!response.ok) return { ok: false };
    else fits = parseWorkbenchHull(await response.json());
    const result: WorkbenchFitsResult = { ok: true, fits };
    cache.set(shipTypeId, { at: now, result });
    return result;
  } catch {
    return { ok: false };
  }
}
