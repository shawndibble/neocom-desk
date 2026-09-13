/**
 * Escape hatch for a boot that never finishes.
 *
 * `BootScreen`'s gates wait on local Dexie reads, and an IndexedDB `open` that
 * is *blocked* never settles: `req.onblocked` only fires an event, it does not
 * reject (dexie 4 `tryOpenDB`). So the read stays pending, nothing throws into
 * render, `ErrorBoundary` never fires, and the spinner is permanent — the
 * shape users hit as "reinstall the Android app to fix it".
 *
 * The suspected holder of the old schema version is the *active* service
 * worker: under `registerType: 'prompt'` it stays in control until
 * `ReloadPrompt` retires it, a push wakes it, and `recordFeedEntry` reopens
 * `neocom` at the version that bundle declares. `registration.waiting`, when
 * there is one, is the *new* bundle — promoting it is what evicts the active
 * one, so that is the one worth messaging. With no update waiting there is
 * nothing to promote and this is a plain reload, which is often enough on its
 * own: it drops this page's own connection and re-races the open.
 *
 * A reload is not a guaranteed cure. A blocker that outlives it — another tab
 * on the origin, or a push waking the worker again — re-enters the same block,
 * and the screen re-arms its timer. What this does guarantee is that the user
 * is never left with no action at all.
 *
 * Every await here is bounded. An unbounded one would reproduce the exact
 * failure this exists to escape, and `try`/`catch` does not help: a promise
 * that never settles is not a rejection.
 */

/** Cap on the service-worker lookup, which is itself a promise that can hang. */
const SW_LOOKUP_TIMEOUT_MS = 2000;
/** Grace for the promoted worker to claim this page before it reloads. */
const SKIP_WAITING_TIMEOUT_MS = 2000;

export interface BootRecoveryEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  /** Bounds the awaits above, and lets the test drive them without real time. */
  wait: (ms: number) => Promise<void>;
}

export function defaultBootRecoveryEnv(): BootRecoveryEnv {
  return {
    getRegistration: () =>
      typeof navigator === 'undefined' || !navigator.serviceWorker
        ? Promise.resolve(undefined)
        : navigator.serviceWorker.getRegistration(),
    reload: () => window.location.reload(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export async function recoverFromStalledBoot(
  env: BootRecoveryEnv = defaultBootRecoveryEnv()
): Promise<void> {
  try {
    const registration = await Promise.race([
      env.getRegistration(),
      env.wait(SW_LOOKUP_TIMEOUT_MS).then(() => undefined),
    ]);
    if (registration?.waiting) {
      // The same message `src/sw.ts` listens for.
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      await env.wait(SKIP_WAITING_TIMEOUT_MS);
    }
  } catch {
    // Nothing here is worth blocking the reload on.
  }
  env.reload();
}
