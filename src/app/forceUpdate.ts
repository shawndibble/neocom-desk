// How long to wait for a freshly-activated service worker to take control
// before reloading anyway — a lost SKIP_WAITING must not leave the button hung.
const CONTROLLER_CHANGE_TIMEOUT_MS = 4000;
// How long to wait for a just-found build to finish installing (precaching).
// Past this the check is reported as failed rather than hanging the button.
const INSTALL_TIMEOUT_MS = 20000;

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForInstall(registration: ServiceWorkerRegistration): Promise<void> {
  const installing = registration.installing;
  if (!installing) return Promise.resolve();
  const settled = new Promise<void>((resolve) => {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') resolve();
    });
  });
  return Promise.race([settled, timeout(INSTALL_TIMEOUT_MS)]);
}

/**
 * Settings → "Update now". Checks for a new build immediately, activates it if
 * one is waiting, then reloads — instead of waiting for ReloadPrompt's polling
 * and route-change/hidden-tab rules. Reloads when already current or when
 * there is no service worker (dev). Resolves `'failed'` without reloading when
 * the check itself fails (offline, network error), so the caller can say so
 * rather than silently reloading onto the old build.
 */
export async function forceUpdate(): Promise<'failed' | undefined> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      // update() already bypasses the HTTP cache for the SW script.
      await registration.update();
      await waitForInstall(registration);
      if (registration.waiting) {
        const controllerChanged = new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          });
        });
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        await Promise.race([controllerChanged, timeout(CONTROLLER_CHANGE_TIMEOUT_MS)]);
      }
    }
  } catch {
    return 'failed';
  }
  window.location.reload();
}
