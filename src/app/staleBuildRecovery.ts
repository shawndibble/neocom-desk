/**
 * Self-heal for a tab or install stuck on a retired build.
 *
 * The service worker precaches `index.html` and serves it for every
 * navigation, so once a deploy retires that build's hashed chunks, a plain
 * reload (even a hard one) gets the same stale shell and the same 404s. The
 * only cure is to drop the worker and its caches, then reload so the browser
 * fetches the live shell and a fresh worker precaches the current build.
 *
 * Touches Cache Storage and worker registrations only — Dexie (settings,
 * tokens) is untouched. Every await is bounded: a never-settling promise would
 * leave the user on the broken page, and `try`/`catch` would not catch it.
 */

const RELOAD_KEY = 'neocom:stale-build-purge-at';
/** One purge per window, so an unreachable chunk (offline) cannot loop. */
const PURGE_WINDOW_MS = 60_000;
const STEP_TIMEOUT_MS = 3000;

export interface StaleBuildEnv {
  now: () => number;
  /** Throws when storage is unavailable. */
  readLast: () => number;
  writeLast: (at: number) => void;
  purge: () => Promise<void>;
  reload: () => void;
}

function bounded(work: Promise<unknown>): Promise<unknown> {
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, STEP_TIMEOUT_MS))]);
}

export function defaultStaleBuildEnv(): StaleBuildEnv {
  return {
    now: () => Date.now(),
    readLast: () => Number(sessionStorage.getItem(RELOAD_KEY) ?? 0),
    writeLast: (at) => sessionStorage.setItem(RELOAD_KEY, String(at)),
    purge: async () => {
      const unregister = navigator.serviceWorker
        ?.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      const clear =
        typeof caches === 'undefined'
          ? undefined
          : caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      await bounded(Promise.all([unregister, clear]));
    },
    reload: () => window.location.reload(),
  };
}

/** Resolves `false` when it declined (already purged this minute, no storage). */
export async function recoverFromStaleBuild(
  env: StaleBuildEnv = defaultStaleBuildEnv()
): Promise<boolean> {
  try {
    const now = env.now();
    if (now - env.readLast() < PURGE_WINDOW_MS) return false;
    env.writeLast(now);
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
