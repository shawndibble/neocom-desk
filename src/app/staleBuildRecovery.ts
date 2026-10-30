/**
 * Self-heal for a tab or install stuck on a retired build.
 *
 * The service worker precaches `index.html` and serves it for every
 * navigation, so once a deploy retires that build's hashed chunks, a plain
 * reload (even a hard one) gets the same stale shell and the same 404s. The
 * only cure is to drop the worker and its caches, then reload so the browser
 * fetches the live shell and a fresh worker precaches the current build.
 *
 * Touches the Workbox precache and worker registrations only — Dexie
 * (settings, tokens) is untouched, and so are the `sde-data`, dogma engine and
 * image caches, which are content-versioned and hold what cannot be refetched
 * offline. Never runs offline: the purge deletes the precache, and with no
 * network the fresh shell it reloads into could not be fetched, turning a
 * failed chunk into a dead app. Every await is bounded: a never-settling promise would
 * leave the user on the broken page, and `try`/`catch` would not catch it.
 */

import {
  isRecoveringFromStaleBuild,
  setStaleBuildRecovery,
  staleBuildRecoveryOutcome,
} from './staleBuildState';
import { MINUTE_MS } from '@/lib/age';

export { isRecoveringFromStaleBuild, staleBuildRecoveryOutcome };

const RELOAD_KEY = 'neocom:stale-build-purge-at';
/** One purge per window, so an unreachable chunk (offline) cannot loop. */
const PURGE_WINDOW_MS = MINUTE_MS;
const STEP_TIMEOUT_MS = 3000;
/** How long the pre-purge network probe may take before the recovery is abandoned. */
const PROBE_TIMEOUT_MS = 5000;

/** The precache cache names Workbox creates (`workbox-precache-v2-<scope>`). */
const PRECACHE_PREFIX = 'workbox-precache';

export interface StaleBuildEnv {
  now: () => number;
  online: () => boolean;
  /** Throws when storage is unavailable. */
  readLast: () => number;
  writeLast: (at: number) => void;
  /** Whether the network can serve a fresh shell right now (bounded, never throws). */
  probe: () => Promise<boolean>;
  purge: () => Promise<void>;
  reload: () => void;
}

function bounded(work: Promise<unknown>): Promise<unknown> {
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, STEP_TIMEOUT_MS))]);
}

/**
 * Drop the service worker and its precache, nothing else. Cache Storage
 * holds more than the precache — `sde-data`, the dogma engine, EVE images —
 * none of it tied to the build, and all of it costly or impossible to refill.
 */
export async function purgeStaleBuildCaches(): Promise<void> {
  const unregister = navigator.serviceWorker
    ?.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())));
  const clear =
    typeof caches === 'undefined'
      ? undefined
      : caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k.startsWith(PRECACHE_PREFIX)).map((k) => caches.delete(k))
            )
          );
  await bounded(Promise.all([unregister, clear]));
}

/**
 * A `no-store` HEAD of the worker script: it is not in the precache, so the
 * service worker passes it to the network. (`/` or `index.html` would be
 * answered from the very precache about to be deleted and prove nothing.)
 */
async function probeNetwork(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sw.js`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function defaultStaleBuildEnv(): StaleBuildEnv {
  return {
    now: () => Date.now(),
    online: () => navigator.onLine !== false,
    readLast: () => Number(sessionStorage.getItem(RELOAD_KEY) ?? 0),
    writeLast: (at) => sessionStorage.setItem(RELOAD_KEY, String(at)),
    probe: probeNetwork,
    purge: purgeStaleBuildCaches,
    reload: () => window.location.reload(),
  };
}

/**
 * Whether a recovery would run right now: online, and not already purged
 * inside the window (or storage blocked, so the window cannot be recorded).
 * Synchronous and side-effect free, because the `vite:preloadError` handler
 * must decide in the same tick whether to `preventDefault()` — cancelling the
 * failure when no recovery follows would strand the route on a pending import.
 */
export function canRecoverFromStaleBuild(env: StaleBuildEnv = defaultStaleBuildEnv()): boolean {
  try {
    if (!env.online()) return false;
    return env.now() - env.readLast() >= PURGE_WINDOW_MS;
  } catch {
    return false;
  }
}

async function run(env: StaleBuildEnv): Promise<boolean> {
  // Prove the network can serve the fresh shell before deleting the only copy
  // that runs: `onLine` is true on a captive portal or a LAN with no internet.
  if (!(await env.probe().catch(() => false))) return false;
  try {
    env.writeLast(env.now());
  } catch {
    return false;
  }
  try {
    await env.purge();
  } catch {
    // Reload anyway; a partial purge still beats leaving the user stuck.
  }
  env.reload();
  return true;
}

/**
 * Resolves `false` when it declined or gave up (offline, purged this minute,
 * no storage, the network probe failed); nothing is purged or reloaded then.
 * A second call while one is in flight shares its outcome.
 */
export function recoverFromStaleBuild(
  env: StaleBuildEnv = defaultStaleBuildEnv()
): Promise<boolean> {
  const running = staleBuildRecoveryOutcome();
  if (running) return running;
  if (!canRecoverFromStaleBuild(env)) return Promise.resolve(false);
  const attempt = run(env).then((reloading) => {
    // An aborted attempt frees the next failure to try again; a reloading one
    // stays set until the page is gone.
    if (!reloading) setStaleBuildRecovery(null);
    return reloading;
  });
  setStaleBuildRecovery(attempt);
  return attempt;
}
