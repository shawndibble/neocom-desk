import { showBootCover, hideBootCover } from './bootCover';
import { compareRelease, fetchLatestRelease } from './latestRelease';
import { INSTALL_TIMEOUT_MS, activateWaitingWorker, timeout, waitForInstall } from './swUpdate';

const FORCE_UPDATE_CHECK_CAP_MS = INSTALL_TIMEOUT_MS + 15_000;

async function checkAndActivate(): Promise<'pending' | undefined> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  await registration.update();
  await waitForInstall(registration);
  if (registration.waiting) {
    await activateWaitingWorker(registration);
    return;
  }
  if (compareRelease(await fetchLatestRelease(), __APP_RELEASE__) === 'different') {
    return 'pending';
  }
}

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
