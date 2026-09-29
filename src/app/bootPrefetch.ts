/**
 * When the boot cache warm-up (`prefetch.ts`) runs: after first paint, in the
 * browser's first idle slot, and from its own chunk.
 *
 * `prefetch.ts` imports a loader from nearly every feature, so importing it
 * from the shell put all of them in the startup bundle; and starting it the
 * moment hydration resolved had it queueing ESI reads against the visible
 * route's own. Both waits are cheap — a warm-up only has to land before the
 * user opens a *second* page.
 */
import type { PrefetchSignal } from './prefetch';

/** Upper bound on the wait for an idle slot (and the timer fallback's delay). */
export const BOOT_PREFETCH_IDLE_TIMEOUT_MS = 2000;

/**
 * Schedules the warm-up for `characterId` and returns its cancel — call it on
 * Character switch: before the idle slot it never starts, after it the run
 * stops taking new tasks.
 */
export function scheduleBootPrefetch(characterId: number): () => void {
  const signal: PrefetchSignal = { cancelled: false };

  const start = () => {
    if (signal.cancelled) return;
    import('./prefetch')
      .then(({ prefetchCharacterData }) => {
        if (!signal.cancelled) return prefetchCharacterData(characterId, signal);
      })
      // A failed chunk load (a stale deploy, offline) only loses the warm-up;
      // every page still loads its own data when opened.
      .catch(() => {});
  };

  let cancelWait: () => void;
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = requestIdleCallback(start, { timeout: BOOT_PREFETCH_IDLE_TIMEOUT_MS });
    cancelWait = () => cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(start, BOOT_PREFETCH_IDLE_TIMEOUT_MS);
    cancelWait = () => clearTimeout(handle);
  }

  return () => {
    signal.cancelled = true;
    cancelWait();
  };
}

/**
 * How long after mount the daily cache prune waits before even asking for an
 * idle slot: past boot, the warm-up and the first route's own reads.
 */
export const CACHE_PRUNE_DELAY_MS = 60_000;

/**
 * Schedules the once-a-day `esiCache` prune (`@/esi/cachePrune`) — after
 * `CACHE_PRUNE_DELAY_MS`, then an idle slot, from its own chunk — and returns
 * its cancel. The prune itself decides whether today's run already happened.
 */
export function scheduleCachePrune(): () => void {
  let cancelled = false;
  let cancelWait = () => {};

  const start = () => {
    if (cancelled) return;
    import('@/esi/cachePrune')
      .then(({ runDailyEsiCachePrune }) => {
        if (!cancelled) return runDailyEsiCachePrune();
      })
      // Nothing to report: a failed run only leaves old rows for tomorrow.
      .catch(() => {});
  };

  const delay = setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start, { timeout: BOOT_PREFETCH_IDLE_TIMEOUT_MS * 5 });
      cancelWait = () => cancelIdleCallback(handle);
    } else {
      const handle = setTimeout(start, BOOT_PREFETCH_IDLE_TIMEOUT_MS);
      cancelWait = () => clearTimeout(handle);
    }
  }, CACHE_PRUNE_DELAY_MS);

  return () => {
    cancelled = true;
    clearTimeout(delay);
    cancelWait();
  };
}
