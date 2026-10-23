/**
 * The release the server is serving right now, from the tiny `version.json`
 * the build emits (vite.config.ts) beside `index.html`. Comparing it with the
 * release baked into the running bundle answers "is there a newer build?" in
 * one small request, without waiting for the service worker to download and
 * precache the whole app first.
 */

export const RELEASE_FILE = 'version.json';

/** Long enough for a slow link, short enough that Settings never hangs on it. */
export const RELEASE_FETCH_TIMEOUT_MS = 5000;

export type ReleaseComparison = 'newer' | 'same' | 'unknown';

/**
 * `null` when the published release could not be read (offline, a host without
 * the file, the SPA fallback page in dev): callers fall back to asking the
 * service worker.
 */
export async function fetchLatestRelease(
  timeoutMs: number = RELEASE_FETCH_TIMEOUT_MS
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // `no-store`: the browser's HTTP cache must not answer. The file is also
    // kept out of the precache (vite.config.ts), so the worker never serves it.
    const response = await fetch(`${import.meta.env.BASE_URL}${RELEASE_FILE}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const release = (body as { release?: unknown } | null)?.release;
    return typeof release === 'string' && release ? release : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function compareRelease(latest: string | null, running: string): ReleaseComparison {
  if (latest === null) return 'unknown';
  return latest === running ? 'same' : 'newer';
}
