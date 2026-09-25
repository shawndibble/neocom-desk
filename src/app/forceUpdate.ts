// How long to wait for a freshly-activated service worker to take control
// before reloading anyway — a lost SKIP_WAITING must not leave the button hung.
const CONTROLLER_CHANGE_TIMEOUT_MS = 4000;

function waitForWaitingWorker(registration: ServiceWorkerRegistration): Promise<void> {
  const installing = registration.installing;
  if (!installing || registration.waiting) return Promise.resolve();
  return new Promise((resolve) => {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') resolve();
    });
  });
}

/**
 * Settings → "Update now". Checks for a new build immediately, activates it if
 * one is waiting, then reloads — instead of waiting for ReloadPrompt's polling
 * and route-change/hidden-tab rules. Always ends in a reload (also when already
 * current, or with no service worker), so it doubles as a hard refresh.
 */
export async function forceUpdate(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      // Bypass the HTTP cache so a stale sw.js can't mask the new build.
      await fetch(registration.active?.scriptURL ?? '/sw.js', { cache: 'no-store' }).catch(
        () => undefined
      );
      await registration.update();
      await waitForWaitingWorker(registration);
      if (registration.waiting) {
        const controllerChanged = new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          });
        });
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        await Promise.race([
          controllerChanged,
          new Promise<void>((resolve) => setTimeout(resolve, CONTROLLER_CHANGE_TIMEOUT_MS)),
        ]);
      }
    }
  } catch {
    // Offline or a flaky update check — still reload below.
  }
  window.location.reload();
}
