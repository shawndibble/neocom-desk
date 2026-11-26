import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import { registerTestReset } from '@/lib/testResets';
import type { SharedPopView } from '@/sync/sharedPops';

export const SHARED_POPS_CACHE_MS = 15 * MINUTE_MS;
export const SHARED_POPS_IDLE_CACHE_MS = HOUR_MS;
export const EMPTY_READS_BEFORE_BACKOFF = 2;

let cached: { at: number; pops: Promise<SharedPopView[]> } | null = null;
let emptyReads = 0;
registerTestReset(() => {
  cached = null;
  emptyReads = 0;
});

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

export function sharingCorporationLabel(corporationId: number, name: string | undefined): string {
  return name ?? `#${corporationId}`;
}
