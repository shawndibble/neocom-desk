/**
 * "The IndexedDB upgrade is blocked" as a signal, rather than a direct Sentry
 * call from `src/db`.
 *
 * `src/db` is imported by `src/sw.ts` (through the Notification Feed), so
 * anything it pulls in ships inside the service-worker bundle — `@sentry/react`
 * is a page-context, React-aware SDK and has no business there. Same shape and
 * same reason as `esi/authFailureSignal.ts`: the shell subscribes, the
 * low-level module stays unaware of who is listening.
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
