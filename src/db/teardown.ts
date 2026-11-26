import Dexie from 'dexie';

const TEARDOWN_NAMES = new Set(['AbortError', 'DatabaseClosedError']);

export function isIdbTeardown(error: unknown): boolean {
  return error instanceof Dexie.DexieError && TEARDOWN_NAMES.has(error.name);
}

export async function ignoreIdbTeardown<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work;
  } catch (error) {
    if (isIdbTeardown(error)) return undefined;
    throw error;
  }
}
