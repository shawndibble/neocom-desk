import { create } from 'zustand';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { compareRelease, fetchLatestRelease } from './latestRelease';
import { INSTALL_TIMEOUT_MS, timeout, waitForInstall } from './swUpdate';

export type UpdateStatus = 'unknown' | 'checking' | 'current' | 'available' | 'offline';

const UPDATE_PROBE_CAP_MS = INSTALL_TIMEOUT_MS + 5_000;

export const useUpdateStatus = create<{
  status: UpdateStatus;
  build: string | null;
  found: number;
}>(() => ({ status: 'unknown', build: null, found: 0 }));

function noteBuild(release: string | null) {
  if (release === null) return;
  const { build, found } = useUpdateStatus.getState();
  if (release === build) return;
  useUpdateStatus.setState({ build: release, found: build === null ? found : found + 1 });
}

function setStatus(status: UpdateStatus) {
  if (useUpdateStatus.getState().status === 'available' && status !== 'available') return;
  useUpdateStatus.setState({ status });
}

const watched = new WeakSet<ServiceWorkerRegistration>();

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
  const latest = await fetchLatestRelease();
  const verdict = compareRelease(latest, __APP_RELEASE__);
  if (verdict === 'same') return 'current';
  if (verdict === 'different') {
    noteBuild(latest);
    registration.update().catch(() => undefined);
    return 'available';
  }
  await registration.update();
  await waitForInstall(registration);
  return registration.waiting ? 'available' : 'current';
}

export async function pollForUpdate(registration: ServiceWorkerRegistration): Promise<void> {
  const latest = await fetchLatestRelease();
  const verdict = compareRelease(latest, __APP_RELEASE__);
  if (verdict === 'same') return;
  if (verdict === 'different') {
    noteBuild(latest);
    setStatus('available');
    registration.update().catch(() => undefined);
    return;
  }
  await registration.update();
}

export function checkForUpdate(): Promise<void> {
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
