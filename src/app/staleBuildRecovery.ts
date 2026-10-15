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

const RELOAD_KEY = 'neocom:stale-build-purge-at';
/** One purge per window, so an unreachable chunk (offline) cannot loop. */
const PURGE_WINDOW_MS = 60_000;
const STEP_TIMEOUT_MS = 3000;

/** The precache cache names Workbox creates (`workbox-precache-v2-<scope>`). */
const PRECACHE_PREFIX = 'workbox-precache';

export interface StaleBuildEnv {
  now: () => number;
  online: () => boolean;
  /** Throws when storage is unavailable. */
  readLast: () => number;
  writeLast: (at: number) => void;
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

export function defaultStaleBuildEnv(): StaleBuildEnv {
  return {
    now: () => Date.now(),
    online: () => navigator.onLine !== false,
    readLast: () => Number(sessionStorage.getItem(RELOAD_KEY) ?? 0),
    writeLast: (at) => sessionStorage.setItem(RELOAD_KEY, String(at)),
    purge: purgeStaleBuildCaches,
    reload: () => window.location.reload(),
  };
}

let recovering = false;

/**
 * True once a recovery has committed to purging and reloading. A route import
 * the handler cancelled resolves `undefined` meanwhile (Vite's preload helper);
 * `guarded` waits for the reload only then, and rejects otherwise.
 */
export function isRecoveringFromStaleBuild(): boolean {
  return recovering;
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

/** Resolves `false` when it declined (offline, purged this minute, no storage). */
export async function recoverFromStaleBuild(
  env: StaleBuildEnv = defaultStaleBuildEnv()
): Promise<boolean> {
  if (!canRecoverFromStaleBuild(env)) return false;
  try {
    env.writeLast(env.now());
  } catch {
    return false;
  }
  recovering = true;
  try {
    await env.purge();
  } catch {
    // Reload anyway; a partial purge still beats leaving the user stuck.
  }
  env.reload();
  return true;
}
