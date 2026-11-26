export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: Omit<RequestInit, 'signal'> = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
  }, timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).catch((error: unknown) => {
    clearTimeout(timer);
    throw error;
  });
}
