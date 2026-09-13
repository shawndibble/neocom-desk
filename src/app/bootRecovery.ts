/**
 * Escape hatch for a boot that never finishes.
 *
 * `BootScreen`'s gates wait on local Dexie reads, and an IndexedDB `open` that
 * is *blocked* never settles: `req.onblocked` only fires an event, it does not
 * reject (dexie 4 `tryOpenDB`). So the read stays pending, nothing throws into
 * render, `ErrorBoundary` never fires, and the spinner is permanent — the
 * shape users hit as "reinstall the Android app to fix it".
 *
 * The likely holder of the old schema version is the previous service-worker
 * bundle: `registerType: 'prompt'` keeps it in control until `ReloadPrompt`
 * retires it, a push wakes it, and `recordFeedEntry` reopens `neocom` at the
 * version *that* bundle declares. Messaging the waiting worker first is what
 * retires it, so the reload lands on a build whose schema matches. A plain
 * reload usually wins the race on its own, so every step here is best-effort:
 * the reload is what must always happen.
 */
const SKIP_WAITING_TIMEOUT_MS = 2000;

export interface BootRecoveryEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  /** Injected so the test does not wait on a real timer. */
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
    const registration = await env.getRegistration();
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
