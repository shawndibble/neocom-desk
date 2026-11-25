import { MINUTE_MS } from '@/lib/age';

/**
 * WebKit loses its connection to Safari's IndexedDB process and every read
 * after that fails until the page reloads (WebKit bugs 273827, 277615, 309386).
 * Dexie cannot reopen its way out of it, and clearing site data does not help,
 * so the only cure is one reload. `useLiveQuery` rethrows the failure during
 * render, which is how it reaches `ErrorBoundary`.
 */
const LOST = /Unable to open cursor|Connection to Indexed Database server lost/i;

/** Reloaded this recently for the same cause: show the error screen instead of looping. */
const RELOAD_COOLDOWN_MS = 5 * MINUTE_MS;
export const IDB_RELOAD_KEY = 'neocom:idb-lost-reload-at';

export function isIdbConnectionLost(error: unknown): boolean {
  // Dexie wraps a native failure and keeps it on `inner`.
  for (let e = error, depth = 0; e instanceof Error && depth < 3; depth++) {
    if (e.name === 'UnknownError' && LOST.test(e.message)) return true;
    e = (e as { inner?: unknown }).inner;
  }
  return false;
}

/** Reloads once per cooldown for a lost IndexedDB connection; returns whether it did. */
export function reloadOnceForLostIdb(
  error: unknown,
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage
): boolean {
  if (!isIdbConnectionLost(error)) return false;
  try {
    const last = Number(storage.getItem(IDB_RELOAD_KEY));
    if (last && now - last < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(IDB_RELOAD_KEY, String(now));
  } catch {
    // No sessionStorage to remember the reload in: a loop is the risk, so do not reload.
    return false;
  }
  reload();
  return true;
}
