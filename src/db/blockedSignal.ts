/**
 * "The IndexedDB upgrade is blocked" as a signal rather than a direct Sentry
 * call from `src/db`, which `src/sw.ts` imports through the Notification Feed
 * — the page-context React SDK has no business in the worker bundle. Same
 * shape and same reason as `esi/authFailureSignal.ts`.
 */
export interface UpgradeBlockedEvent {
  oldVersion: number;
  newVersion: number | null;
}

type Listener = (event: UpgradeBlockedEvent) => void;

const listeners = new Set<Listener>();

export function onUpgradeBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitUpgradeBlocked(event: UpgradeBlockedEvent): void {
  // A throwing listener must not become a second failure on top of the one
  // being reported.
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // ignored
    }
  }
}
