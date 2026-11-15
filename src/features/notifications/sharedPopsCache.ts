/**
 * One cached read of the Shared Pops this device's Characters may see (issue #6225), shared by the
 * Shared Moon Pop poll domain (once per poll, for every Character) and Settings' list of sharing
 * corporations. `fetchSharedPops` costs a callable, ESI affiliation reads and Firestore reads, and
 * the book behind it syncs every 6 hours, so a 15-minute window is plenty: a Pop Time is fixed
 * once an Extraction starts. A failed read is not cached, so the next caller tries again.
 *
 * The read seam is imported lazily: it reaches Firebase, which stays out of the main bundle.
 */
import { MINUTE_MS } from '@/lib/age';
import { registerTestReset } from '@/lib/testResets';
import type { SharedPopView } from '@/sync/sharedPops';

export const SHARED_POPS_CACHE_MS = 15 * MINUTE_MS;

let cached: { at: number; pops: Promise<SharedPopView[]> } | null = null;
registerTestReset(() => {
  cached = null;
});

export function loadSharedPopsCached(now: number = Date.now()): Promise<SharedPopView[]> {
  if (cached !== null && now - cached.at < SHARED_POPS_CACHE_MS) return cached.pops;
  const entry = {
    at: now,
    pops: import('@/sync/sharedPops').then(({ fetchSharedPops }) => fetchSharedPops()),
  };
  cached = entry;
  entry.pops.catch(() => {
    if (cached === entry) cached = null;
  });
  return entry.pops;
}

/** A sharing corporation by name, or by id when its name is unknown. */
export function sharingCorporationLabel(corporationId: number, name: string | undefined): string {
  return name ?? `#${corporationId}`;
}
