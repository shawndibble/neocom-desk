export const RELEASE_FILE = 'version.json';

const RELEASE_FETCH_TIMEOUT_MS = 5000;

export type ReleaseComparison = 'different' | 'same' | 'unknown';

export async function fetchLatestRelease(
  timeoutMs: number = RELEASE_FETCH_TIMEOUT_MS
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
  return latest === running ? 'same' : 'different';
}
