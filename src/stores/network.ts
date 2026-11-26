import { useEffect, useState, useSyncExternalStore } from 'react';

type Listener = () => void;

const changeListeners = new Set<Listener>();
const reconnectListeners = new Set<Listener>();
let attached = false;

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function notify(listeners: ReadonlySet<Listener>): void {
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

attach();

import.meta.hot?.dispose(() => {
  window.removeEventListener('online', onOnlineEvent);
  window.removeEventListener('offline', onOfflineEvent);
});

function subscribe(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

export function onReconnect(callback: () => void): () => void {
  reconnectListeners.add(callback);
  return () => void reconnectListeners.delete(callback);
}

export function useReconnectCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => onReconnect(() => setCount((n) => n + 1)), []);
  return count;
}
