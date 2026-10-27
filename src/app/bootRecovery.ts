import { getServiceWorkerRegistration } from '@/lib/serviceWorker';

/**
 * Escape hatch for a boot that never finishes.
 *
 * `db.on('blocked')` (src/db/index.ts) turns the common cause — a blocked
 * upgrade — into a real error that `ErrorBoundary` handles. This covers what
 * that cannot: a boot still unresolved with no `blocked` event to close on.
 *
 * Promoting a waiting worker is worth a try first. Under `registerType:
 * 'prompt'` the *waiting* worker is the new bundle and the old one is active,
 * so promoting it is what evicts an active worker still holding an older
 * schema version. With no update waiting there is nothing to promote and this
 * is a plain reload, which often suffices on its own.
 *
 * A reload is not a guaranteed cure — a blocker that outlives it (another tab,
 * a push waking the worker) re-enters the same state. The guarantee is only
 * that the user is never left with no action at all.
 *
 * Every await is bounded. An unbounded one would reproduce the exact failure
 * this exists to escape, and `try`/`catch` would not catch it: a promise that
 * never settles is not a rejection.
 */

/** Bounds each step: the lookup, then the promoted worker's claim. */
const RECOVERY_STEP_TIMEOUT_MS = 2000;

export interface BootRecoveryEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  /** Bounds the awaits above, and lets the test drive them without real time. */
  wait: (ms: number) => Promise<void>;
}

export function defaultBootRecoveryEnv(): BootRecoveryEnv {
  return {
    getRegistration: getServiceWorkerRegistration,
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
      env.wait(RECOVERY_STEP_TIMEOUT_MS).then(() => undefined),
    ]);
    if (registration?.waiting) {
      // The same message `src/sw.ts` listens for.
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      await env.wait(RECOVERY_STEP_TIMEOUT_MS);
    }
  } catch {
    // Nothing here is worth blocking the reload on.
  }
  env.reload();
}
