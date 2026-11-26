import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import { isRecord } from '@/engine/guards';
import { MINUTE_MS } from '@/lib/age';

const CACHE_TTL_MS = 10 * MINUTE_MS;
const READ_TIMEOUT_MS = 20_000;

export interface WorkbenchFit {
  id: string;
  name: string;
  authorId: number | null;
  authorName: string;
  dateAdded: number;
  eft: string;
}

export type WorkbenchFitsResult = { ok: true; fits: WorkbenchFit[] } | { ok: false };

export function workbenchFitsUrl(shipTypeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/workbench-fits/${shipTypeId}.json`;
}

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
  return [...byId.values()].sort(
    (a, b) => b.dateAdded - a.dateAdded || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const cache = new Map<number, { at: number; result: WorkbenchFitsResult }>();

export function resetWorkbenchFitsCache(): void {
  cache.clear();
}

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
