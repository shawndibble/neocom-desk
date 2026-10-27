/**
 * Service-worker update steps shared by the boot-time swap (`bootUpdate.ts`)
 * and Settings → "Update app" (`forceUpdate.ts`). Every await is bounded: a
 * promise that never settles is not a rejection, and either caller would hang.
 */

/** How long to wait for a freshly-activated worker to take control before reloading anyway. */
export const CONTROLLER_CHANGE_TIMEOUT_MS = 4000;
/** How long to wait for a just-found build to finish installing (precaching). */
export const INSTALL_TIMEOUT_MS = 20000;

export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves when the registration's installing worker has installed (or failed), or after `ms`. */
export function waitForInstall(
  registration: ServiceWorkerRegistration,
  ms: number = INSTALL_TIMEOUT_MS
): Promise<void> {
  const installing = registration.installing;
  if (!installing) return Promise.resolve();
  const settled = new Promise<void>((resolve) => {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') resolve();
    });
  });
  return Promise.race([settled, timeout(ms)]);
}

/**
 * Posts SKIP_WAITING to the registration's waiting worker and waits (bounded)
 * for the controllerchange this call asked for. A one-shot listener — never a
 * global controllerchange-to-reload hook. No-op without a waiting worker.
 */
export async function activateWaitingWorker(
  registration: ServiceWorkerRegistration,
  ms: number = CONTROLLER_CHANGE_TIMEOUT_MS
): Promise<void> {
  const waiting = registration.waiting;
  if (!waiting) return;
  const container = navigator.serviceWorker;
  let onChange: (() => void) | undefined;
  const controllerChanged = new Promise<void>((resolve) => {
    onChange = () => resolve();
    container.addEventListener('controllerchange', onChange, { once: true });
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  try {
    await Promise.race([controllerChanged, timeout(ms)]);
  } finally {
    if (onChange) container.removeEventListener?.('controllerchange', onChange);
  }
}
