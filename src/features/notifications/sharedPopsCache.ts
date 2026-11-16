/**
 * One cached read of the Shared Pops this device's Characters may see (issue #6225), shared by the
 * Shared Moon Pop poll domain (once per poll, for every Character), Settings' list of sharing
 * corporations and the Calendar (which asks for a fresher one). `fetchSharedPops` costs a callable, ESI affiliation reads and Firestore reads, and
 * the book behind it syncs every 6 hours, so a 15-minute window is plenty: a Pop Time is fixed
 * once an Extraction starts. A failed read is not cached, so the next caller tries again.
 *
 * Most pilots see no Shared Pops at all, and every signed-in device polls: after
 * `EMPTY_READS_BEFORE_BACKOFF` empty reads in a row the window grows to an hour, and the first
 * read with a pop in it shrinks it back.
 *
 * The read seam is imported lazily: it reaches Firebase, which stays out of the main bundle.
 */
import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import { registerTestReset } from '@/lib/testResets';
import type { SharedPopView } from '@/sync/sharedPops';

export const SHARED_POPS_CACHE_MS = 15 * MINUTE_MS;
/** The window once the reads keep coming back empty. */
export const SHARED_POPS_IDLE_CACHE_MS = HOUR_MS;
export const EMPTY_READS_BEFORE_BACKOFF = 2;

let cached: { at: number; pops: Promise<SharedPopView[]> } | null = null;
let emptyReads = 0;
registerTestReset(() => {
  cached = null;
  emptyReads = 0;
});

/**
 * The cached read, fetched again once it is older than `maxAgeMs` (by default the poll's window,
 * an hour while the reads keep coming back empty).
 */
export function loadSharedPopsCached(
  now: number = Date.now(),
  maxAgeMs?: number
): Promise<SharedPopView[]> {
  const window =
    maxAgeMs ??
    (emptyReads >= EMPTY_READS_BEFORE_BACKOFF ? SHARED_POPS_IDLE_CACHE_MS : SHARED_POPS_CACHE_MS);
  if (cached !== null && now - cached.at < window) return cached.pops;
  const entry = {
    at: now,
    pops: import('@/sync/sharedPops').then(({ fetchSharedPops }) => fetchSharedPops()),
  };
  cached = entry;
  entry.pops.then(
    (pops) => {
      emptyReads = pops.length === 0 ? emptyReads + 1 : 0;
    },
    () => {
      if (cached === entry) cached = null;
    }
  );
  return entry.pops;
}

/** A sharing corporation by name, or by id when its name is unknown. */
export function sharingCorporationLabel(corporationId: number, name: string | undefined): string {
  return name ?? `#${corporationId}`;
}
