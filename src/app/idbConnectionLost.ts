import { MINUTE_MS } from '@/lib/age';

const LOST = /Unable to open cursor|Connection to Indexed Database server lost/i;

const RELOAD_COOLDOWN_MS = 5 * MINUTE_MS;
export const IDB_RELOAD_KEY = 'neocom:idb-lost-reload-at';

export function isIdbConnectionLost(error: unknown): boolean {
  for (let e = error, depth = 0; e instanceof Error && depth < 3; depth++) {
    if (e.name === 'UnknownError' && LOST.test(e.message)) return true;
    e = (e as { inner?: unknown }).inner;
  }
  return false;
}

export function reloadOnceForLostIdb(
  error: unknown,
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage
): boolean {
  if (!isIdbConnectionLost(error)) return false;
  try {
    const last = Number(storage.getItem(IDB_RELOAD_KEY));
    if (last && now - last < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(IDB_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

export async function characterRowCount(
  count: () => Promise<number>,
  timeoutMs = 300
): Promise<number | 'unavailable'> {
  try {
    return await Promise.race([
      count(),
      new Promise<'unavailable'>((resolve) => setTimeout(() => resolve('unavailable'), timeoutMs)),
    ]);
  } catch {
    return 'unavailable';
  }
}
