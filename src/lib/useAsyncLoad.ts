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

export function useAsyncLoad<T>(loader: () => Promise<T>): AsyncLoad<T> {
  return useLoad(loader, loader, true);
}

export function useKeyedLoad<T>(
  key: string | null,
  loader: () => Promise<T>,
  idle = false
): AsyncLoad<T> {
  return useLoad(key, loader, key !== null && !idle);
}
