import Dexie from 'dexie';

/**
 * IndexedDB going away under a caller, as opposed to a caller doing something
 * wrong. iOS WebKit aborts in-flight transactions (and can close the
 * connection outright) when a tab is backgrounded or the device is under
 * memory pressure; Dexie surfaces that as `AbortError` ("Transaction aborted",
 * with no underlying cause) or `DatabaseClosedError`. Nothing the app did
 * caused it, and nothing it can do about it, so background work that would
 * simply retry on its next tick treats it as a skipped tick.
 *
 * The same two names Dexie's own `liveQuery` drops silently — deliberately no
 * wider: any other failure is still a bug worth hearing about. Dexie's own
 * errors only, too, so an `AbortError` from a cancelled fetch is not taken
 * for one.
 */
const TEARDOWN_NAMES = new Set(['AbortError', 'DatabaseClosedError']);

export function isIdbTeardown(error: unknown): boolean {
  return error instanceof Dexie.DexieError && TEARDOWN_NAMES.has(error.name);
}

/**
 * `work`, with an IndexedDB teardown resolved to `undefined` instead of
 * rejecting. Every other rejection passes through untouched.
 */
export async function ignoreIdbTeardown<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work;
  } catch (error) {
    if (isIdbTeardown(error)) return undefined;
    throw error;
  }
}
