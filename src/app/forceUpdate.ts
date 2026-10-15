import { showBootCover, hideBootCover } from './bootCover';
import { activateWaitingWorker, waitForInstall } from './swUpdate';

/**
 * Settings → "Update now". Checks for a new build immediately, activates it if
 * one is waiting, then reloads — instead of waiting for the next cold start or
 * browser reload (see bootUpdate.ts). Reloads when already current or when
 * there is no service worker (dev). Resolves `'failed'` without reloading when
 * the check itself fails (offline, network error), so the caller can say so
 * rather than silently reloading onto the old build.
 *
 * Covers the page with the boot screen before swapping, so the swap and reload
 * read as a boot rather than a flicker; takes the cover down again on failure.
 */
export async function forceUpdate(): Promise<'failed' | undefined> {
  showBootCover();
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      // update() already bypasses the HTTP cache for the SW script.
      await registration.update();
      await waitForInstall(registration);
      await activateWaitingWorker(registration);
    }
  } catch {
    hideBootCover();
    return 'failed';
  }
  window.location.reload();
}
