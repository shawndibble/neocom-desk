import { BOOT_IDLE_TIMEOUT_MS, scheduleIdle } from '@/lib/scheduleIdle';
import type { PrefetchSignal } from './prefetch';
import { MINUTE_MS } from '@/lib/age';

export const BOOT_PREFETCH_IDLE_TIMEOUT_MS = BOOT_IDLE_TIMEOUT_MS;

export function scheduleBootPrefetch(characterId: number): () => void {
  const signal: PrefetchSignal = { cancelled: false };

  const start = () => {
    if (signal.cancelled) return;
    import('./prefetch')
      .then(({ prefetchCharacterData }) => {
        if (!signal.cancelled) return prefetchCharacterData(characterId, signal);
      })
      .catch(() => {});
  };

  const cancelWait = scheduleIdle(start, BOOT_PREFETCH_IDLE_TIMEOUT_MS);

  return () => {
    signal.cancelled = true;
    cancelWait();
  };
}

export const CACHE_PRUNE_DELAY_MS = MINUTE_MS;

export function scheduleCachePrune(): () => void {
  let cancelled = false;
  let cancelWait = () => {};

  const start = () => {
    if (cancelled) return;
    import('@/esi/cachePrune')
      .then(({ runDailyEsiCachePrune }) => {
        if (!cancelled) return runDailyEsiCachePrune();
      })
      .catch(() => {});
  };

  const delay = setTimeout(() => {
    cancelWait = scheduleIdle(
      start,
      BOOT_PREFETCH_IDLE_TIMEOUT_MS * 5,
      BOOT_PREFETCH_IDLE_TIMEOUT_MS
    );
  }, CACHE_PRUNE_DELAY_MS);

  return () => {
    cancelled = true;
    clearTimeout(delay);
    cancelWait();
  };
}

export const LAZY_SDE_WARM_DELAY_MS = 90_000;

export function scheduleLazySdeWarm(delayMs: number = LAZY_SDE_WARM_DELAY_MS): () => void {
  const signal = { cancelled: false };
  let cancelWait = () => {};

  const start = () => {
    if (signal.cancelled) return;
    import('@/sde/warmLazySde')
      .then(({ warmLazySde }) => {
        if (!signal.cancelled) return warmLazySde(signal);
      })
      .catch(() => {});
  };

  const delay = setTimeout(() => {
    cancelWait = scheduleIdle(
      start,
      BOOT_PREFETCH_IDLE_TIMEOUT_MS * 5,
      BOOT_PREFETCH_IDLE_TIMEOUT_MS
    );
  }, delayMs);

  return () => {
    signal.cancelled = true;
    clearTimeout(delay);
    cancelWait();
  };
}
