import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { timeout, waitForInstall } from './swUpdate';

// A check that never settles must read as "nothing found", not hang the button's highlight.
const UPDATE_PROBE_CAP_MS = 15_000;

async function probe(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return false;
  if (!registration.waiting) {
    await registration.update();
    await waitForInstall(registration);
  }
  return !!registration.waiting;
}

/**
 * Whether a newer build is waiting to be applied, after asking the server for
 * one. Looks only (like ReloadPrompt): applying is `forceUpdate`. Every failure
 * (offline, no worker, timeout) resolves `false` — the button stays usable.
 */
export async function isUpdateAvailable(): Promise<boolean> {
  try {
    return await Promise.race([probe(), timeout(UPDATE_PROBE_CAP_MS).then(() => false)]);
  } catch {
    return false;
  }
}
