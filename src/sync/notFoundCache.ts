/**
 * Remembers that a Firestore document did not exist (issue #5076). Every `getDoc` of a
 * missing document is still a billed read, and a few paths ask again on each load: a
 * Character's `corpTaxBookBilledBy` pointer, a corp with no book, a deleted Community.
 * A miss is kept in Dexie per document path with an expiry, so it survives reloads.
 * A local action that creates the document clears it (`clearNotFound`).
 */
import { db as localDb } from '@/db';

const KEY_PREFIX = 'notFound:';

/** How long each kind of miss is trusted before the document is read again. */
export const NOT_FOUND_TTL_MS = {
  /** Written by the sync when a book starts billing the Character, so recheck often. */
  billedByPointer: 3_600_000,
  /** A corp with no book: turning one on clears this on this device. */
  corpBook: 6 * 3_600_000,
  /** A deleted Community never returns (new ones get new ids). */
  community: 24 * 3_600_000,
} as const;

/** True while a miss for `path` is remembered and unexpired. */
export async function isKnownMissing(path: string, now = Date.now()): Promise<boolean> {
  try {
    const until = (await localDb.settings.get(KEY_PREFIX + path))?.value;
    return typeof until === 'number' && until > now;
  } catch {
    return false;
  }
}

/** Remember that `path` did not exist, for `ttlMs`. */
export async function rememberMissing(
  path: string,
  ttlMs: number,
  now = Date.now()
): Promise<void> {
  try {
    await localDb.settings.put({ key: KEY_PREFIX + path, value: now + ttlMs });
  } catch {
    // A convenience; the next load reads the document again.
  }
}

/** Forget the misses at `path`, or under it when it ends in `/`. */
export async function clearNotFound(path: string): Promise<void> {
  try {
    const key = KEY_PREFIX + path;
    if (path.endsWith('/')) {
      await localDb.settings.where('key').startsWith(key).delete();
    } else {
      await localDb.settings.delete(key);
    }
  } catch {
    // Same: worst case the miss expires on its own.
  }
}

/**
 * A document's data, or `undefined` when it does not exist. A remembered miss skips the
 * read; a fresh miss is remembered.
 */
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
