export const CONTROLLER_CHANGE_TIMEOUT_MS = 4000;
export const INSTALL_TIMEOUT_MS = 20000;

export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
