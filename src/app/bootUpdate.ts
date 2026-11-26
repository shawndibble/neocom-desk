import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { currentRouterPathname, isOnRoute, isPublicRoute } from './routerPath';
import { activateWaitingWorker, waitForInstall } from './swUpdate';

export const BOOT_UPDATE_CHECK_CAP_MS = 3500;

const SWAP_KEY = 'neocom:boot-update-at';
const SWAP_WINDOW_MS = 30_000;

export type BootUpdateOutcome = 'applying' | 'current' | 'skipped';

export interface BootUpdateEnv {
  online: boolean;
  pathname: string;
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  hasController: boolean;
  wait: (ms: number) => Promise<void>;
  reload: () => void;
  now: () => number;
  readLast: () => number;
  writeLast: (at: number) => void;
}

export function defaultBootUpdateEnv(): BootUpdateEnv {
  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pathname: currentRouterPathname(),
    getRegistration: getServiceWorkerRegistration,
    hasController: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    readLast: () => Number(sessionStorage.getItem(SWAP_KEY) ?? 0),
    writeLast: (at) => sessionStorage.setItem(SWAP_KEY, String(at)),
  };
}

export function bootUpdateMayHold(env: BootUpdateEnv = defaultBootUpdateEnv()): boolean {
  return (
    env.online &&
    env.hasController &&
    !isOnRoute(env.pathname, '/callback') &&
    !isPublicRoute(env.pathname)
  );
}

async function swap(
  env: BootUpdateEnv,
  registration: ServiceWorkerRegistration
): Promise<BootUpdateOutcome> {
  try {
    const now = env.now();
    if (now - env.readLast() < SWAP_WINDOW_MS) return 'current';
    env.writeLast(now);
  } catch {
    return 'current';
  }
  try {
    await activateWaitingWorker(registration);
  } catch {}
  env.reload();
  return 'applying';
}

async function checkWithinCap(
  env: BootUpdateEnv,
  registration: ServiceWorkerRegistration
): Promise<void> {
  const found = (async () => {
    await registration.update();
    await waitForInstall(registration, BOOT_UPDATE_CHECK_CAP_MS);
  })();
  found.catch(() => undefined);
  await Promise.race([found, env.wait(BOOT_UPDATE_CHECK_CAP_MS)]);
}

function lookForUpdate(registration: ServiceWorkerRegistration) {
  try {
    registration.update().catch(() => undefined);
  } catch {}
}

async function settleWorker(env: BootUpdateEnv, registration: ServiceWorkerRegistration) {
  await checkWithinCap(env, registration);
  if (registration.waiting) await activateWaitingWorker(registration);
}

export async function runBootUpdate(
  env: BootUpdateEnv = defaultBootUpdateEnv()
): Promise<BootUpdateOutcome> {
  try {
    if (!env.online) return 'skipped';

    if (isOnRoute(env.pathname, '/callback')) {
      void env
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
      return 'skipped';
    }

    if (isPublicRoute(env.pathname)) return 'skipped';

    const registration = await Promise.race([
      env.getRegistration(),
      env.wait(BOOT_UPDATE_CHECK_CAP_MS).then(() => undefined),
    ]);

    if (!registration) return 'current';

    if (!env.hasController) {
      await settleWorker(env, registration);
      return 'current';
    }

    if (registration.waiting) return await swap(env, registration);

    lookForUpdate(registration);
    return 'current';
  } catch {
    return 'current';
  }
}
