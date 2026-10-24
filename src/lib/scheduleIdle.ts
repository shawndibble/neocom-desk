/**
 * Runs `start` in the browser's next idle slot, at most `timeoutMs` later.
 * Where `requestIdleCallback` is missing (Safari), a plain timer after
 * `fallbackMs` (default `timeoutMs`) stands in. Returns the cancel.
 */
export function scheduleIdle(
  start: () => void,
  timeoutMs: number,
  fallbackMs: number = timeoutMs
): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = requestIdleCallback(() => start(), { timeout: timeoutMs });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(start, fallbackMs);
  return () => clearTimeout(handle);
}
