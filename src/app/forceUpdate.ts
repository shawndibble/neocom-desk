import { showBootCover, hideBootCover } from './bootCover';
import { compareRelease, fetchLatestRelease } from './latestRelease';
import { INSTALL_TIMEOUT_MS, activateWaitingWorker, timeout, waitForInstall } from './swUpdate';

// A check that never settles must not leave the cover up with no way out.
// Above the install wait plus the release read (5 s), with room for the
// `sw.js` fetch, so a slow precache ends as `pending`, not `failed`.
const FORCE_UPDATE_CHECK_CAP_MS = INSTALL_TIMEOUT_MS + 15_000;

/** `pending`: a newer release is published, but no worker for it has installed yet. */
async function checkAndActivate(): Promise<'pending' | undefined> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  // update() already bypasses the HTTP cache for the SW script.
  await registration.update();
  await waitForInstall(registration);
  if (registration.waiting) {
    await activateWaitingWorker(registration);
    return;
  }
  // `version.json` can name a new release before the worker can install it: a
  // CDN still serving the old `sw.js`, or a precache still downloading. A
  // reload then lands on the same build, so say so instead.
  if (compareRelease(await fetchLatestRelease(), __APP_RELEASE__) === 'different') {
    return 'pending';
  }
}

/**
 * Settings → "Update app". Checks for a new build immediately, activates it if
 * one is waiting, then reloads — instead of waiting for the next cold start or
 * browser reload (see bootUpdate.ts). Reloads when already current or when
 * there is no service worker (dev). Resolves `'failed'` without reloading when
 * the check itself fails (offline, network error), so the caller can say so
 * rather than silently reloading onto the old build, and `'pending'` without
 * reloading when a newer release is published but its worker has not installed.
 *
 * Covers the page with the boot screen before swapping, so the swap and reload
 * read as a boot rather than a flicker; takes the cover down again when it
 * does not reload.
 */
export async function forceUpdate(): Promise<'failed' | 'pending' | undefined> {
  showBootCover();
  let outcome: 'pending' | undefined;
  try {
    outcome = await Promise.race([
      checkAndActivate(),
      timeout(FORCE_UPDATE_CHECK_CAP_MS).then((): never => {
        throw new Error('update check timed out');
      }),
    ]);
  } catch {
    hideBootCover();
    return 'failed';
  }
  if (outcome === 'pending') {
    hideBootCover();
    return 'pending';
  }
  window.location.reload();
}
