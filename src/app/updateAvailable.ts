import { create } from 'zustand';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { compareRelease, fetchLatestRelease } from './latestRelease';
import { INSTALL_TIMEOUT_MS, timeout, waitForInstall } from './swUpdate';

/**
 * `unknown`: no check has run yet (the Settings route has not mounted).
 * `offline`: the check could not run or did not settle in time.
 */
export type UpdateStatus = 'unknown' | 'checking' | 'current' | 'available' | 'offline';

// A check that never settles must read as "couldn't check", not hang the "Checking" line.
// Longer than the install wait, so a slow precache is not cut off first.
const UPDATE_PROBE_CAP_MS = INSTALL_TIMEOUT_MS + 5_000;

export const useUpdateStatus = create<{ status: UpdateStatus }>(() => ({ status: 'unknown' }));

// `available` only clears when the build is applied (a reload): a late or
// overlapping check must not report "current" or "offline" over a build we saw.
function setStatus(status: UpdateStatus) {
  if (useUpdateStatus.getState().status === 'available' && status !== 'available') return;
  useUpdateStatus.setState({ status });
}

const watched = new WeakSet<ServiceWorkerRegistration>();

/**
 * Marks `available` the moment this registration has a waiting worker, or an
 * installing one reaches `installed`. Looks only (like ReloadPrompt): applying
 * is `forceUpdate`, and nothing here reloads on a controllerchange.
 */
export function watchRegistration(registration: ServiceWorkerRegistration) {
  if (watched.has(registration)) return;
  watched.add(registration);
  if (registration.waiting) setStatus('available');
  const watchInstalling = () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && registration.waiting) setStatus('available');
    });
  };
  watchInstalling();
  registration.addEventListener('updatefound', watchInstalling);
}

async function probe(registration: ServiceWorkerRegistration): Promise<UpdateStatus> {
  // The published release says at once whether a build exists, with no wait on
  // the download: a newer one is `available` now, and the worker fetches it in
  // the background (applying it, `forceUpdate`, waits on that install itself).
  const verdict = compareRelease(await fetchLatestRelease(), __APP_RELEASE__);
  if (verdict === 'same') return 'current';
  if (verdict === 'newer') {
    registration.update().catch(() => undefined);
    return 'available';
  }
  // Unreadable (no `version.json`, a flaky read): ask the worker, and wait for
  // it to say, as before.
  await registration.update();
  await waitForInstall(registration);
  return registration.waiting ? 'available' : 'current';
}

/**
 * One bounded check for a newer build, written to `useUpdateStatus`. A worker
 * already waiting is `available` with no `checking` state. Run once per
 * Settings mount; never on a timer.
 */
export function checkForUpdate(): Promise<void> {
  // A remount (StrictMode, back-and-forth) while a check runs shares it.
  inflight ??= runCheck().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

let inflight: Promise<void> | undefined;

async function runCheck(): Promise<void> {
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return setStatus('current');
    watchRegistration(registration);
    if (registration.waiting) return setStatus('available');
    if (navigator.onLine === false) return setStatus('offline');
    setStatus('checking');
    setStatus(
      await Promise.race([
        probe(registration),
        timeout(UPDATE_PROBE_CAP_MS).then((): UpdateStatus => 'offline'),
      ])
    );
  } catch {
    setStatus('offline');
  }
}
