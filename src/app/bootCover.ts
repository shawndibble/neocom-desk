import { useSyncExternalStore } from 'react';

/**
 * A tiny external store for "cover the page with the boot screen": a swap that
 * is about to reload (Settings → "Update app", a stale-build purge) shows it so
 * the reload reads as a boot. Plain module state so non-React callers can flip
 * it; `BootCoverHost` renders it.
 */
let shown = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (shown === next) return;
  shown = next;
  listeners.forEach((listener) => listener());
}

export function showBootCover() {
  set(true);
}

export function hideBootCover() {
  set(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBootCover(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => false
  );
}
