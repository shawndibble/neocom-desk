import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { currentRouterPathname, isOnRoute } from './routerPath';
import { activateWaitingWorker, waitForInstall } from './swUpdate';

/**
 * Applies a waiting service-worker build, but only here: on a cold start or a
 * browser reload, behind the boot screen (a page no worker controls just brings
 * the worker up to date, quietly). Never on a route change, and a
 * running tab never reloads for an update (ReloadPrompt only looks).
 *
 * The check is capped so a slow network never holds the boot; a build that
 * lands after the cap simply waits for the next load. Every await is bounded
 * and every failure ends as `'current'`/`'skipped'` — the app must boot.
 */

/** The most a boot waits on the update check. */
export const BOOT_UPDATE_CHECK_CAP_MS = 3500;

const SWAP_KEY = 'neocom:boot-update-at';
/** A swap started this recently that is still pending means it did not take; do not retry. */
const SWAP_WINDOW_MS = 30_000;

export type BootUpdateOutcome = 'applying' | 'current' | 'skipped' | 'timed-out';

export interface BootUpdateEnv {
  online: boolean;
  /** Router pathname of the page being booted. */
  pathname: string;
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  hasController: boolean;
  /** Bounds the awaits, and lets the test drive them without real time. */
  wait: (ms: number) => Promise<void>;
  reload: () => void;
  now: () => number;
  /** Throws when storage is unavailable. */
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

/**
 * Whether a boot could have anything to wait for. When it can't — offline, on
 * `/callback`, or no worker controlling the page (dev, a blocked worker, the
 * first install) — the app must render on the first frame, exactly as it did
 * before this gate existed: its Dexie open, and the schema upgrade with it,
 * must not slip behind an await.
 */
export function bootUpdateMayHold(env: BootUpdateEnv = defaultBootUpdateEnv()): boolean {
  return env.online && env.hasController && !isOnRoute(env.pathname, '/callback');
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
  } catch {
    // Reload anyway: the worker may have taken control without the event.
  }
  env.reload();
  return 'applying';
}

/**
 * Asks for a newer build and waits for it to install, up to the cap. Resolves
 * `'cap'` when the cap passes first; a check that fails or lands late is
 * simply left to finish on its own.
 */
async function checkWithinCap(
  env: BootUpdateEnv,
  registration: ServiceWorkerRegistration
): Promise<'checked' | 'cap'> {
  const found = (async () => {
    await registration.update();
    await waitForInstall(registration, BOOT_UPDATE_CHECK_CAP_MS);
    return 'checked' as const;
  })();
  // A rejection after the cap has won must not surface unhandled.
  found.catch(() => undefined);
  return Promise.race([found, env.wait(BOOT_UPDATE_CHECK_CAP_MS).then(() => 'cap' as const)]);
}

/**
 * A page no worker controls (a hard reload, which bypasses the worker) already
 * runs the latest build from the network, so there is nothing to reload into:
 * only bring the worker up to date, so the next normal load serves the new
 * precache instead of swapping on it. Always checks first: a worker already
 * waiting may be older than the build this page just fetched, and activating it
 * would make a stale precache control the live page. Never reloads, never holds
 * the page.
 */
async function settleWorker(env: BootUpdateEnv, registration: ServiceWorkerRegistration) {
  await checkWithinCap(env, registration);
  if (registration.waiting) await activateWaitingWorker(registration);
}

export async function runBootUpdate(
  env: BootUpdateEnv = defaultBootUpdateEnv()
): Promise<BootUpdateOutcome> {
  try {
    if (!env.online) return 'skipped';

    // A reload there replays the OAuth code, already spent: look (unawaited, so
    // the page never waits on it), never swap.
    if (isOnRoute(env.pathname, '/callback')) {
      void env
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
      return 'skipped';
    }

    const registration = await Promise.race([
      env.getRegistration(),
      env.wait(BOOT_UPDATE_CHECK_CAP_MS).then(() => undefined),
    ]);

    // Dev or a blocked worker: nothing to swap.
    if (!registration) return 'current';

    if (!env.hasController) {
      await settleWorker(env, registration);
      return 'current';
    }

    if (registration.waiting) return await swap(env, registration);

    const raced = await checkWithinCap(env, registration);
    if (raced === 'cap') return 'timed-out';
    return registration.waiting ? await swap(env, registration) : 'current';
  } catch {
    return 'current';
  }
}
