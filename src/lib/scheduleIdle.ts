export const BOOT_IDLE_TIMEOUT_MS = 2000;

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
