import { db as localDb } from '@/db';
import { HOUR_MS } from '@/lib/age';

const KEY_PREFIX = 'notFound:';

export const NOT_FOUND_TTL_MS = {
  billedByPointer: HOUR_MS,
  corpBook: 6 * HOUR_MS,
  community: 24 * HOUR_MS,
} as const;

export async function isKnownMissing(path: string, now = Date.now()): Promise<boolean> {
  try {
    const until = (await localDb.settings.get(KEY_PREFIX + path))?.value;
    return typeof until === 'number' && until > now;
  } catch {
    return false;
  }
}

export async function rememberMissing(
  path: string,
  ttlMs: number,
  now = Date.now()
): Promise<void> {
  try {
    await localDb.settings.put({ key: KEY_PREFIX + path, value: now + ttlMs });
  } catch {}
}

export async function clearNotFound(path: string): Promise<void> {
  try {
    const key = KEY_PREFIX + path;
    if (path.endsWith('/')) {
      await localDb.settings.where('key').startsWith(key).delete();
    } else {
      await localDb.settings.delete(key);
    }
  } catch {}
}

export async function getDocUnlessKnownMissing(
  path: string,
  ttlMs: number,
  read: () => Promise<{ exists(): boolean; data(): Record<string, unknown> | undefined }>
): Promise<Record<string, unknown> | undefined> {
  if (await isKnownMissing(path)) return undefined;
  const snap = await read();
  if (!snap.exists()) {
    await rememberMissing(path, ttlMs);
    return undefined;
  }
  return snap.data();
}
