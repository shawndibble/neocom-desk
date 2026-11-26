import {
  isRecoveringFromStaleBuild,
  setStaleBuildRecovery,
  staleBuildRecoveryOutcome,
} from './staleBuildState';
import { MINUTE_MS } from '@/lib/age';

export { isRecoveringFromStaleBuild, staleBuildRecoveryOutcome };

const RELOAD_KEY = 'neocom:stale-build-purge-at';
const PURGE_WINDOW_MS = MINUTE_MS;
const STEP_TIMEOUT_MS = 3000;
const PROBE_TIMEOUT_MS = 5000;

const PRECACHE_PREFIX = 'workbox-precache';

export interface StaleBuildEnv {
  now: () => number;
  online: () => boolean;
  readLast: () => number;
  writeLast: (at: number) => void;
  probe: () => Promise<boolean>;
  purge: () => Promise<void>;
  reload: () => void;
}

function bounded(work: Promise<unknown>): Promise<unknown> {
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, STEP_TIMEOUT_MS))]);
}

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

export function canRecoverFromStaleBuild(env: StaleBuildEnv = defaultStaleBuildEnv()): boolean {
  try {
    if (!env.online()) return false;
    return env.now() - env.readLast() >= PURGE_WINDOW_MS;
  } catch {
    return false;
  }
}

async function run(env: StaleBuildEnv): Promise<boolean> {
  if (!(await env.probe().catch(() => false))) return false;
  try {
    env.writeLast(env.now());
  } catch {
    return false;
  }
  try {
    await env.purge();
  } catch {}
  env.reload();
  return true;
}

export function recoverFromStaleBuild(
  env: StaleBuildEnv = defaultStaleBuildEnv()
): Promise<boolean> {
  const running = staleBuildRecoveryOutcome();
  if (running) return running;
  if (!canRecoverFromStaleBuild(env)) return Promise.resolve(false);
  const attempt = run(env).then((reloading) => {
    if (!reloading) setStaleBuildRecovery(null);
    return reloading;
  });
  setStaleBuildRecovery(attempt);
  return attempt;
}
