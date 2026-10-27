import { useEffect, useState } from 'react';
import { useRetryableLoad } from './useRetryableLoad';

export type AsyncLoad<T> =
  | { status: 'idle' | 'loading'; data: undefined; retry: () => void }
  | { status: 'failed'; data: undefined; retry: () => void }
  | { status: 'ready'; data: T; retry: () => void };

interface Settled<T> {
  slot: unknown;
  outcome: { ok: true; value: T } | { ok: false };
}

/**
 * The shared body: run `loader` whenever `slot`, `loader` or a retry changes,
 * drop a result that arrives after the effect was superseded, and keep the
 * last settled result for as long as `slot` is unchanged (so a new `loader`
 * for the same `slot` refreshes behind what is showing).
 *
 * Nothing is set when a load starts: "loading" is derived from the stored
 * result belonging to another `slot`, so there is no reset to run in the effect.
 */
function useLoad<T>(slot: unknown, loader: () => Promise<T>, enabled: boolean): AsyncLoad<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const { failed, attempt, fail, clear, retry } = useRetryableLoad();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    clear();
    loader().then(
      (value) => {
        if (!cancelled) setSettled({ slot, outcome: { ok: true, value } });
      },
      () => {
        if (cancelled) return;
        setSettled({ slot, outcome: { ok: false } });
        fail();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, slot, loader, attempt, clear, fail]);

  if (!enabled) return { status: 'idle', data: undefined, retry };
  const mine = settled !== null && settled.slot === slot ? settled.outcome : null;
  if (mine?.ok) return { status: 'ready', data: mine.value, retry };
  if (mine && failed) return { status: 'failed', data: undefined, retry };
  return { status: 'loading', data: undefined, retry };
}

/**
 * Load one value; a new `loader` identity (wrap it in `useCallback` over what
 * it reads) discards the old result and loads again. A rejection is `failed`,
 * retried by `retry()` or by itself when the connection returns.
 */
export function useAsyncLoad<T>(loader: () => Promise<T>): AsyncLoad<T> {
  return useLoad(loader, loader, true);
}

/**
 * Like `useAsyncLoad`, but results belong to `key`: another key's result is
 * never shown, while a new `loader` for the same key refreshes behind the last
 * result instead of blanking it. A null `key`, or `idle`, loads nothing.
 */
export function useKeyedLoad<T>(
  key: string | null,
  loader: () => Promise<T>,
  idle = false
): AsyncLoad<T> {
  return useLoad(key, loader, key !== null && !idle);
}
