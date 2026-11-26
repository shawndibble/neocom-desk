import { useSyncExternalStore } from 'react';

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
