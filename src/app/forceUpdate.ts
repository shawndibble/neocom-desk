import { showBootCover, hideBootCover } from './bootCover';
import { activateWaitingWorker, timeout, waitForInstall } from './swUpdate';

// A check that never settles must not leave the cover up with no way out.
const FORCE_UPDATE_CHECK_CAP_MS = 30_000;

async function checkAndActivate() {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  // update() already bypasses the HTTP cache for the SW script.
  await registration.update();
  await waitForInstall(registration);
  await activateWaitingWorker(registration);
}

/**
 * Settings → "Update app". Checks for a new build immediately, activates it if
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
    await Promise.race([
      checkAndActivate(),
      timeout(FORCE_UPDATE_CHECK_CAP_MS).then(() => {
        throw new Error('update check timed out');
      }),
    ]);
  } catch {
    hideBootCover();
    return 'failed';
  }
  window.location.reload();
}
