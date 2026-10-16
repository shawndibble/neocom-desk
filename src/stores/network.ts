/**
 * The browser's connection state, in one place.
 *
 * One module-level `online`/`offline` listener feeds everything that needs to
 * know: `isOnline()` for code that just asks, `useOnline()` for a component,
 * `onReconnect()` for work that must catch up once the connection returns.
 * Before this each consumer attached its own listener pair, and none of them
 * could say "we just came back".
 *
 * `navigator.onLine` is a hint, not proof: `true` means "a network interface is
 * up", so a captive portal or a dead uplink still reads online. That is why the
 * ESI layer keeps its own network-failure handling (`esi/cache.ts`) and treats
 * this only as the fast path for the case the browser is sure about.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

type Listener = () => void;

const changeListeners = new Set<Listener>();
const reconnectListeners = new Set<Listener>();
let attached = false;

/** Whether the browser believes it has a connection. Always true where there is no `navigator`. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function notify(listeners: ReadonlySet<Listener>): void {
  // A copy, so a listener that unsubscribes itself does not skip its neighbour.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A network listener threw', err);
    }
  }
}

function onOnlineEvent(): void {
  notify(changeListeners);
  notify(reconnectListeners);
}

function onOfflineEvent(): void {
  notify(changeListeners);
}

function attach(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('online', onOnlineEvent);
  window.addEventListener('offline', onOfflineEvent);
}

// Attached at load, so a transition that happens before anything subscribes is
// still seen by `onReconnect` callers that subscribe afterwards.
attach();

// A hot-reloaded copy of this module attaches its own pair; without this the
// old one would keep firing beside it.
import.meta.hot?.dispose(() => {
  window.removeEventListener('online', onOnlineEvent);
  window.removeEventListener('offline', onOfflineEvent);
});

function subscribe(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

/** The connection state, re-rendering on change. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

/** Calls `callback` each time the browser comes back online. Returns the unsubscribe. */
export function onReconnect(callback: () => void): () => void {
  reconnectListeners.add(callback);
  return () => void reconnectListeners.delete(callback);
}

/**
 * A counter that bumps each time the browser comes back online, for an effect
 * that must re-run its lookup on reconnect: list it as a dependency.
 */
export function useReconnectCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => onReconnect(() => setCount((n) => n + 1)), []);
  return count;
}
